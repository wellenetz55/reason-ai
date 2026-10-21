"use server";
import { revalidatePath } from "next/cache";
import { requireWritableCustomer } from "@/lib/session";
import { draftBrakes } from "@/server/brakes";
import { loadProfileContext } from "@/server/profile";
import { aiGuard } from "@/server/aiGuard";
import { BRAKE_KINDS, BRAKE_SOURCES } from "@/lib/brakes";

const KINDS = new Set<string>(BRAKE_KINDS.map((k) => k.key));
const SOURCES = new Set<string>(BRAKE_SOURCES.map((s) => s.key));
const TAGS = ["fact", "verify", "hypothesis"];
const BRAKE_BATCH = 6; // 1回のAI呼び出しで扱う組数（6組×4種類≒24枚。返答が途中で切れない量）

/** ブレーキがまだ無い組（最大10組）に、AIの下書きを付ける */
export async function requestBrakeDrafts() {
  const { supabase, company, user } = await requireWritableCustomer();
  const [{ data: rows }, { data: existing }, profile] = await Promise.all([
    supabase.from("sheet_rows").select("id, value_raw, experience_value, experience_value_v1").eq("company_id", company.id).eq("status", "active").order("seq"),
    supabase.from("brakes").select("row_id, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id).eq("status", "active"),
    loadProfileContext(supabase, company.id),
  ]);
  const has = new Set((existing ?? []).map((b) => b.row_id));
  const targets = (rows ?? []).filter((r) => r.value_raw && !has.has(r.id)).slice(0, BRAKE_BATCH).map((r) => ({ id: r.id, value: r.value_raw as string, experience: r.experience_value ?? r.experience_value_v1 }));
  if (!targets.length) { revalidatePath("/sheet/brakes"); return; }
  const drafts = await aiGuard(supabase, company.id, user.id, "brakes.draft", () => draftBrakes({ companyName: company.name, profile, rows: targets }));
  if (!drafts) { revalidatePath("/sheet/brakes"); return; }
  const ids = new Set(targets.map((t) => t.id));
  const inserts = drafts.filter((d) => ids.has(d.id)).map((d) => ({ row_id: d.id, kind: d.kind, customer_words: d.words, source_tag: d.source, evidence_tag: d.tag, created_by: "ai", status: "active" }));
  if (inserts.length) await supabase.from("brakes").insert(inserts);
  // AIが1枚も返さなかった組は「ブレーキなし（AIが材料から見つけられなかった）」として残り続けるので、その旨を記録して画面で伝える
  if (inserts.length === 0) {
    await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "brakes.draft.error", payload: { msg: "AIが下書きを1枚も返しませんでした" } });
    revalidatePath("/sheet/brakes");
    return;
  }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "brakes.draft", payload: { rows: targets.length, n: inserts.length } });
  revalidatePath("/sheet/brakes");
}

/** ブレーキ1枚を 直す／承認／保留（外す）／戻す */
export async function saveBrake(formData: FormData) {
  const { supabase, company, user } = await requireWritableCustomer();
  const id = String(formData.get("id"));
  const action = String(formData.get("action")); // fix | approve | drop | restore
  const { data: b } = await supabase.from("brakes").select("id, row_id, customer_words, sheet_rows!inner(company_id)").eq("id", id).eq("sheet_rows.company_id", company.id).maybeSingle();
  if (!b) return;
  const patch: Record<string, unknown> = {};
  if (action === "fix") {
    const words = String(formData.get("words") || "").trim().slice(0, 400);
    if (!words) return;
    const source = String(formData.get("source") || "own");
    const tag = String(formData.get("tag") || "hypothesis");
    patch.customer_words = words;
    patch.source_tag = SOURCES.has(source) ? source : "own";
    patch.evidence_tag = TAGS.includes(tag) ? tag : "hypothesis";
    patch.created_by = "customer";
    patch.approved_at = new Date().toISOString();
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
}

/** 御社がブレーキを自分で1枚追加する */
export async function addBrake(formData: FormData) {
  const { supabase, company, user } = await requireWritableCustomer();
  const rowId = String(formData.get("row_id"));
  const kind = String(formData.get("kind") || "");
  const words = String(formData.get("words") || "").trim().slice(0, 400);
  const source = String(formData.get("source") || "own");
  const tag = String(formData.get("tag") || "hypothesis");
  if (!KINDS.has(kind) || !words) return;
  const { data: row } = await supabase.from("sheet_rows").select("id").eq("id", rowId).eq("company_id", company.id).maybeSingle();
  if (!row) return;
  await supabase.from("brakes").insert({ row_id: rowId, kind, customer_words: words, source_tag: SOURCES.has(source) ? source : "own", evidence_tag: TAGS.includes(tag) ? tag : "hypothesis", created_by: "customer", status: "active", approved_at: new Date().toISOString() });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "brakes.add", payload: { kind } });
  revalidatePath("/sheet/brakes");
}
