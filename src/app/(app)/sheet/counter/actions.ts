"use server";
import { revalidatePath } from "next/cache";
import { requireStage } from "@/server/stageGuard";
import { draftCounters, type CounterIn } from "@/server/counter";
import { loadProfileContext } from "@/server/profile";
import { aiGuard } from "@/server/aiGuard";
import { MAX, cut } from "@/lib/limits";
import { decodeCounter, encodeCounter } from "@/lib/history";

const TAGS = ["fact", "verify", "hypothesis"];
const COUNTER_BATCH = 8; // 1回のAI呼び出しで扱うブレーキの枚数

type BrakeRow = { id: string; row_id: string; kind: string; customer_words: string | null; counter_message: string | null; because?: string | null; because_tag?: string | null; counter_history: string[] | null; sheet_rows: { value_raw: string | null; experience_value: string | null; experience_value_v1: string | null; status: string } };

async function loadOpenBrakes(supabase: Awaited<ReturnType<typeof requireStage>>["supabase"], companyId: string) {
  const { data } = await supabase
    .from("brakes")
    .select("id, row_id, kind, customer_words, counter_message, because, because_tag, counter_history, created_at, sheet_rows!inner(company_id, status, seq, value_raw, experience_value, experience_value_v1)")
    .eq("sheet_rows.company_id", companyId)
    .eq("sheet_rows.status", "active")
    .eq("status", "active")
    .order("created_at");
  return (data ?? []) as unknown as (BrakeRow & { created_at: string })[];
}

const toIn = (b: BrakeRow): CounterIn => ({
  id: b.id, kind: b.kind, words: b.customer_words ?? "", value: b.sheet_rows.value_raw ?? "",
  experience: b.sheet_rows.experience_value ?? b.sheet_rows.experience_value_v1, avoid: (b.counter_history ?? []).slice(-5).map((h) => decodeCounter(h).c),
});

/** ⑤が空のブレーキ（COUNTER_BATCH 枚ずつ）に、AIの下書きを付ける */
export async function requestCounterDrafts() {
  const { supabase, company, user } = await requireStage("counter");
  const [all, profile, { data: past }] = await Promise.all([
    loadOpenBrakes(supabase, company.id),
    loadProfileContext(supabase, company.id),
    supabase.from("activity_log").select("payload").eq("company_id", company.id).in("event", ["counter.draft", "counter.draft.error"]).order("created_at", { ascending: false }).limit(20),
  ]);
  // 前にAIへ頼んで返らなかったブレーキは後回し
  const skipped = new Set((past ?? []).flatMap((l) => ((l.payload as { skipped?: string[] } | null)?.skipped ?? [])));
  const pending = all.filter((b) => b.customer_words && !b.counter_message?.trim());
  const targets = [...pending.filter((b) => !skipped.has(b.id)), ...pending.filter((b) => skipped.has(b.id))].slice(0, COUNTER_BATCH);
  if (!targets.length) { revalidatePath("/sheet/counter"); return; }
  const drafts = await aiGuard(supabase, company.id, user.id, "counter.draft", () => draftCounters({ companyName: company.name, profile, items: targets.map(toIn) }));
  if (!drafts) { revalidatePath("/sheet/counter"); return; }
  const ids = new Set(targets.map((t) => t.id));
  let n = 0;
  for (const d of drafts) {
    if (!ids.has(d.id)) continue;
    // AIを待つ間にお客様が書いた答えは上書きしない（空のままのものだけに入れる）
    const { data: upd } = await supabase.from("brakes")
      .update({ counter_message: d.counter, because: d.because || null, because_tag: d.tag, counter_by: "ai", counter_approved_at: null })
      .eq("id", d.id).or("counter_message.is.null,counter_message.eq.").select("id");
    if (upd?.length) n++;
  }
  const got = new Set(drafts.map((d) => d.id));
  const skippedNow = targets.map((t) => t.id).filter((id) => !got.has(id));
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: n === 0 ? "counter.draft.error" : "counter.draft", payload: n === 0 ? { msg: "AIが答えを1件も返しませんでした", skipped: skippedNow } : { n, skipped: skippedNow } });
  revalidatePath("/sheet/counter");
}

/** 1枚だけ、AIに別の答えを出してもらう（前の案と同じにならないように伝える） */
export async function redraftCounter(formData: FormData) {
  const { supabase, company, user } = await requireStage("counter");
  const id = String(formData.get("id"));
  const all = await loadOpenBrakes(supabase, company.id);
  const b = all.find((x) => x.id === id);
  if (!b || !b.customer_words) return;
  // 前の答えは ⑥なぜなら・印ごと履歴に残す（あとで「この答えに戻す」で選び直せるように）
  const history = [...(b.counter_history ?? []), ...(b.counter_message ? [encodeCounter({ c: b.counter_message, b: b.because ?? null, t: b.because_tag ?? null })] : [])].slice(-5);
  const profile = await loadProfileContext(supabase, company.id);
  const drafts = await aiGuard(supabase, company.id, user.id, "counter.draft", () => draftCounters({ companyName: company.name, profile, items: [{ ...toIn(b), avoid: history.map((h) => decodeCounter(h).c) }] }));
  const d = drafts?.find((x) => x.id === id);
  if (!d) { revalidatePath("/sheet/counter"); return; }
  await supabase.from("brakes").update({ counter_message: d.counter, because: d.because || null, because_tag: d.tag, counter_by: "ai", counter_approved_at: null, counter_history: history }).eq("id", id);
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "counter.draft", payload: { n: 1, redraft: true } });
  revalidatePath("/sheet/counter");
}

/** ⑤⑥を 直す／承認する */
export async function saveCounter(formData: FormData) {
  const { supabase, company, user } = await requireStage("counter");
  const id = String(formData.get("id"));
  const action = String(formData.get("action")); // fix | approve | reopen
  const { data: b } = await supabase.from("brakes").select("id, row_id, counter_message, because, because_tag, counter_history, sheet_rows!inner(company_id)").eq("id", id).eq("sheet_rows.company_id", company.id).maybeSingle();
  if (!b) return;
  if (action === "fix") {
    const counter = cut(String(formData.get("counter") || "").trim(), MAX.value);
    const because = cut(String(formData.get("because") || "").trim(), MAX.value);
    const tag = String(formData.get("tag") || "hypothesis");
    if (!counter) return;
    // 直す前の答えも履歴に残す（直したあとで、前の答えに戻したくなったとき用）
    const changed = !!b.counter_message && (b.counter_message !== counter || (b.because ?? "") !== because);
    const history = changed ? [...((b.counter_history as string[] | null) ?? []), encodeCounter({ c: b.counter_message as string, b: (b.because as string | null) ?? null, t: (b.because_tag as string | null) ?? null })].slice(-5) : undefined;
    await supabase.from("brakes").update({ counter_message: counter, because: because || null, because_tag: TAGS.includes(tag) ? tag : "hypothesis", counter_by: "customer", counter_approved_at: new Date().toISOString(), ...(history ? { counter_history: history } : {}) }).eq("id", id);
    await supabase.from("sheet_row_reviews").insert({ row_id: b.row_id, column_key: "counter_message", action: "fix", before_text: b.counter_message, after_text: counter, reviewer_id: user.id });
  } else if (action === "approve") {
    await supabase.from("brakes").update({ counter_approved_at: new Date().toISOString() }).eq("id", id);
    await supabase.from("sheet_row_reviews").insert({ row_id: b.row_id, column_key: "counter_message", action: "approve", before_text: b.counter_message, after_text: b.counter_message, reviewer_id: user.id });
  } else if (action === "reopen") {
    await supabase.from("brakes").update({ counter_approved_at: null }).eq("id", id);
  } else return;
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "counter.save", payload: { action } });
  revalidatePath("/sheet/counter");
}

/** 前に出た答え（履歴）の1つを、いまの答えに戻す。いまの答えは履歴に回す */
export async function restoreCounter(formData: FormData) {
  const { supabase, company, user } = await requireStage("counter");
  const id = String(formData.get("id"));
  const idx = Number(formData.get("idx"));
  const { data: b } = await supabase.from("brakes").select("id, row_id, counter_message, because, because_tag, counter_by, counter_history, sheet_rows!inner(company_id)").eq("id", id).eq("sheet_rows.company_id", company.id).maybeSingle();
  if (!b) return;
  const hist = ((b.counter_history as string[] | null) ?? []).slice();
  if (!Number.isInteger(idx) || idx < 0 || idx >= hist.length) return;
  const picked = decodeCounter(hist[idx]);
  hist.splice(idx, 1);
  if (b.counter_message) hist.push(encodeCounter({ c: b.counter_message as string, b: (b.because as string | null) ?? null, t: (b.because_tag as string | null) ?? null }));
  await supabase.from("brakes").update({
    counter_message: cut(picked.c, MAX.value), because: picked.b ? cut(picked.b, MAX.value) : null,
    because_tag: picked.t && TAGS.includes(picked.t) ? picked.t : "hypothesis",
    counter_by: "ai", counter_approved_at: null, counter_history: hist.slice(-5),
  }).eq("id", id);
  await supabase.from("sheet_row_reviews").insert({ row_id: b.row_id, column_key: "counter_message", action: "fix", before_text: b.counter_message, after_text: picked.c, reviewer_id: user.id });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "counter.save", payload: { action: "restore" } });
  revalidatePath("/sheet/counter");
}

