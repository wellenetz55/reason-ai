"use server";
import { revalidatePath } from "next/cache";
import { requireStage } from "@/server/stageGuard";
import { draftBrakes } from "@/server/brakes";
import { loadProfileContext } from "@/server/profile";
import { aiGuard } from "@/server/aiGuard";
import { BRAKE_KINDS, BRAKE_SOURCES } from "@/lib/brakes";
import { encodeCounter } from "@/lib/history";
import { nl } from "@/lib/limits";

const KINDS = new Set<string>(BRAKE_KINDS.map((k) => k.key));
const SOURCES = new Set<string>(BRAKE_SOURCES.map((s) => s.key));
const TAGS = ["fact", "verify", "hypothesis"];
const BRAKE_BATCH = 6; // 1回のAI呼び出しで扱う組数（6組×4種類≒24枚。返答が途中で切れない量）

/** ブレーキがまだ無い組（BRAKE_BATCH 組ずつ）に、AIの下書きを付ける */
export async function requestBrakeDrafts() {
  const { supabase, company, user } = await requireStage("brakes");
  const [{ data: rows }, { data: existing }, profile, { data: past }] = await Promise.all([
    supabase.from("sheet_rows").select("id, value_raw, experience_value, experience_value_v1").eq("company_id", company.id).eq("status", "active").order("seq"),
    supabase.from("brakes").select("row_id, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id).eq("status", "active"),
    loadProfileContext(supabase, company.id),
    supabase.from("activity_log").select("payload").eq("company_id", company.id).in("event", ["brakes.draft", "brakes.draft.error"]).order("created_at", { ascending: false }).limit(20),
  ]);
  const has = new Set((existing ?? []).map((b) => b.row_id));
  // 前にAIへ頼んだが1枚も返らなかった組は後回しにする（毎回先頭に来て、後ろの組に進めなくなるのを防ぐ）
  const skipped = new Set((past ?? []).flatMap((l) => ((l.payload as { skipped?: string[] } | null)?.skipped ?? [])));
  const pending = (rows ?? []).filter((r) => r.value_raw && !has.has(r.id));
  const targets = [...pending.filter((r) => !skipped.has(r.id)), ...pending.filter((r) => skipped.has(r.id))].slice(0, BRAKE_BATCH).map((r) => ({ id: r.id, value: r.value_raw as string, experience: r.experience_value ?? r.experience_value_v1 }));
  if (!targets.length) { revalidatePath("/sheet/brakes"); return; }
  const drafts = await aiGuard(supabase, company.id, user.id, "brakes.draft", () => draftBrakes({ companyName: company.name, profile, rows: targets }));
  if (!drafts) { revalidatePath("/sheet/brakes"); return; }
  // AIを待つ間に、二度押し等で同じ組へ先に下書きが入っていたら、その組には重ねて入れない
  const { data: after } = await supabase.from("brakes").select("row_id").in("row_id", targets.map((t) => t.id)).eq("status", "active");
  const taken = new Set((after ?? []).map((b) => b.row_id));
  const ids = new Set(targets.map((t) => t.id).filter((id) => !taken.has(id)));
  const inserts = drafts.filter((d) => ids.has(d.id)).map((d) => ({ row_id: d.id, kind: d.kind, customer_words: d.words, source_tag: d.source, evidence_tag: d.tag, created_by: "ai", status: "active" }));
  if (inserts.length) await supabase.from("brakes").insert(inserts);
  const got = new Set(inserts.map((x) => x.row_id));
  const skippedNow = [...ids].filter((id) => !got.has(id));
  // AIが1枚も返さなかった組は「ブレーキなし（AIが材料から見つけられなかった）」として残り続けるので、その旨を記録して画面で伝える
  if (inserts.length === 0 && ids.size > 0) {
    await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "brakes.draft.error", payload: { msg: "AIが下書きを1枚も返しませんでした", skipped: skippedNow } });
    revalidatePath("/sheet/brakes");
    return;
  }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "brakes.draft", payload: { rows: targets.length, n: inserts.length, skipped: skippedNow } });
  revalidatePath("/sheet/brakes");
}

/** ブレーキ1枚を 直す／承認／保留（外す）／戻す */
export async function saveBrake(formData: FormData) {
  const { supabase, company, user } = await requireStage("brakes");
  const id = String(formData.get("id"));
  const action = String(formData.get("action")); // fix | approve | drop | restore
  const { data: b } = await supabase.from("brakes").select("id, row_id, customer_words, counter_message, because, because_tag, counter_by, counter_history, sheet_rows!inner(company_id)").eq("id", id).eq("sheet_rows.company_id", company.id).maybeSingle();
  if (!b) return;
  const patch: Record<string, unknown> = {};
  if (action === "fix") {
    const words = nl(String(formData.get("words") || "")).trim().slice(0, 400);
    if (!words) return;
    const source = String(formData.get("source") || "own");
    const tag = String(formData.get("tag") || "hypothesis");
    patch.customer_words = words;
    patch.source_tag = SOURCES.has(source) ? source : "own";
    patch.evidence_tag = TAGS.includes(tag) ? tag : "hypothesis";
    patch.created_by = "customer";
    patch.approved_at = new Date().toISOString();
    // ブレーキの言葉が変わったら、STEP 4 の答えは別の言葉に向けて書いたものなので外す（前の答えは履歴に残す）
    if (words !== nl(b.customer_words) && b.counter_message?.trim()) {
      patch.counter_history = [...((b.counter_history as string[] | null) ?? []), encodeCounter({ c: b.counter_message, b: (b.because as string | null) ?? null, t: (b.because_tag as string | null) ?? null, a: (b.counter_by as string | null) ?? null })].slice(-5);
      patch.counter_message = null;
      patch.because = null;
      patch.because_tag = "hypothesis";
      patch.counter_by = null;
      patch.counter_approved_at = null;
    }
    await supabase.from("sheet_row_reviews").insert({ row_id: b.row_id, column_key: "brake_words", action: "fix", before_text: b.customer_words, after_text: words, reviewer_id: user.id });
  } else if (action === "approve") {
    patch.approved_at = new Date().toISOString();
    await supabase.from("sheet_row_reviews").insert({ row_id: b.row_id, column_key: "brake_words", action: "approve", before_text: b.customer_words, after_text: b.customer_words, reviewer_id: user.id });
  } else if (action === "drop") {
    patch.status = "dropped";
    patch.approved_at = null;
    await supabase.from("sheet_row_reviews").insert({ row_id: b.row_id, column_key: "brake_words", action: "hold", before_text: b.customer_words, after_text: b.customer_words, reviewer_id: user.id });
  } else if (action === "restore") {
    patch.status = "active";
  } else return;
  await supabase.from("brakes").update(patch).eq("id", id);
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "brakes.save", payload: { action } });
  revalidatePath("/sheet/brakes");
  revalidatePath("/sheet/counter");
}

/** 御社がブレーキを自分で1枚追加する */
export async function addBrake(formData: FormData) {
  const { supabase, company, user } = await requireStage("brakes");
  const rowId = String(formData.get("row_id"));
  const kind = String(formData.get("kind") || "");
  const words = nl(String(formData.get("words") || "")).trim().slice(0, 400);
  const source = String(formData.get("source") || "own");
  const tag = String(formData.get("tag") || "hypothesis");
  if (!KINDS.has(kind) || !words) return;
  const { data: row } = await supabase.from("sheet_rows").select("id").eq("id", rowId).eq("company_id", company.id).maybeSingle();
  if (!row) return;
  await supabase.from("brakes").insert({ row_id: rowId, kind, customer_words: words, source_tag: SOURCES.has(source) ? source : "own", evidence_tag: TAGS.includes(tag) ? tag : "hypothesis", created_by: "customer", status: "active", approved_at: new Date().toISOString() });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "brakes.add", payload: { kind } });
  revalidatePath("/sheet/brakes");
}
