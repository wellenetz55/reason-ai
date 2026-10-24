"use server";
import { revalidatePath } from "next/cache";
import { requireStage } from "@/server/stageGuard";
import { draftLitmus } from "@/server/litmus";
import { loadProfileContext } from "@/server/profile";
import { aiGuard } from "@/server/aiGuard";
import { createAdminClient } from "@/lib/supabase/admin";
import { MARKET_AXES, marketTotal, type AxisKey } from "@/lib/litmus";
import { MAX, cut } from "@/lib/limits";
import { sealGate, sealRetry } from "@/server/seals";
import { MARKS } from "@/lib/litmus";

const ynText = (b: boolean | null | undefined) => (b === true ? "はい" : b === false ? "いいえ" : "わからない");
/** 封の記録に残す形：ニッチの2問（答えていなければ空） */
const nicheText = (q1: boolean | null | undefined, q2: boolean | null | undefined) => (q1 == null && q2 == null ? "" : `問1 ${ynText(q1)}／問2 ${ynText(q2)}`);
/** 封の記録に残す形：市場の7軸（選んだ軸だけ） */
const marketText = (r: Record<string, unknown> | null | undefined) => !r ? "" : MARKET_AXES.map((a) => {
  const v = r[a.key] == null || r[a.key] === "" ? null : Number(r[a.key]);
  return v == null || Number.isNaN(v) ? null : `${a.label}${MARKS.find((m) => m.v === v)?.label ?? v}`;
}).filter(Boolean).join("・");

const BATCH = 8;

/** まだAIの仮判定が無い組（BATCH 組ずつ）に、ニッチの2問と市場フィットの仮判定を付ける */
export async function requestLitmusDrafts() {
  const { supabase, company, user } = await requireStage("litmus");
  const [{ data: rows }, { data: niche }, profile] = await Promise.all([
    supabase.from("sheet_rows").select("id, value_raw, experience_value, experience_value_v1, because_phrase").eq("company_id", company.id).eq("status", "active").order("seq"),
    supabase.from("litmus_niche").select("row_id, ai_note, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id),
    loadProfileContext(supabase, company.id),
  ]);
  const done = new Set((niche ?? []).filter((n) => n.ai_note).map((n) => n.row_id));
  const targets = (rows ?? []).filter((r) => r.value_raw && !done.has(r.id)).slice(0, BATCH)
    .map((r) => ({ id: r.id, value: r.value_raw as string, experience: r.experience_value ?? r.experience_value_v1, because: r.because_phrase }));
  if (!targets.length) { revalidatePath("/sheet/litmus"); return; }
  const drafts = await aiGuard(supabase, company.id, user.id, "litmus.draft", () => draftLitmus({ companyName: company.name, profile, rows: targets }));
  if (!drafts) { revalidatePath("/sheet/litmus"); return; }
  const ids = new Set(targets.map((t) => t.id));
  // AIの仮判定は別の列・別の行（scored_by=ai）に置く。お客様の答えは上書きしない。
  // お客様のロールは scored_by=ai の行を書けないので、ここだけサーバ側（会社の行であることは上で確かめ済み）
  const admin = createAdminClient();
  let n = 0;
  for (const d of drafts) {
    if (!ids.has(d.id)) continue;
    await admin.from("litmus_niche").upsert({ row_id: d.id, ai_q1: d.q1, ai_q2: d.q2, ai_note: d.note || "（判断の材料が足りません）" }, { onConflict: "row_id" });
    const marks = d.marks as Partial<Record<AxisKey, number>>;
    if (Object.keys(marks).length) {
      const rec: Record<string, unknown> = { row_id: d.id, scored_by: "ai", scored_at: new Date().toISOString(), total: marketTotal(marks).total };
      for (const a of MARKET_AXES) rec[a.key] = a.key === "common_sense" ? (marks[a.key] ?? null)?.toString() ?? null : marks[a.key] ?? null;
      await admin.from("litmus_market").upsert(rec, { onConflict: "row_id,scored_by" });
    }
    n++;
  }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: n ? "litmus.draft" : "litmus.draft.error", payload: n ? { n } : { msg: "AIが仮判定を返しませんでした" } });
  revalidatePath("/sheet/litmus");
}

/** ニッチの2問に答える（はい／いいえ／わからない） */
export async function answerNiche(formData: FormData) {
  const { supabase, company, user } = await requireStage("litmus");
  const rowId = String(formData.get("row_id"));
  const v = (k: string) => { const x = String(formData.get(k) ?? ""); return x === "yes" ? true : x === "no" ? false : null; };
  const { data: row } = await supabase.from("sheet_rows").select("id, created_at").eq("id", rowId).eq("company_id", company.id).maybeSingle();
  if (!row) return;
  // 封（確認セッション②）：封の時点で御社が答えていた2問を変えるときは、理由が要る（記録に残す）
  const { data: prev } = await supabase.from("litmus_niche").select("q1_pain_urgency, q2_actively_seeking, judged_by").eq("row_id", rowId).maybeSingle();
  const before = prev?.judged_by === "customer" ? nicheText(prev.q1_pain_urgency, prev.q2_actively_seeking) : "";
  if (!(await sealGate({ supabase, companyId: company.id, userId: user.id, formData, changes: [{ column: "litmus_niche.answer", rowId, createdAt: row.created_at, before, after: nicheText(v("q1"), v("q2")) }] }))) sealRetry("/sheet/litmus");
  await supabase.from("litmus_niche").upsert({ row_id: rowId, q1_pain_urgency: v("q1"), q2_actively_seeking: v("q2"), judged_by: "customer", updated_at: new Date().toISOString() }, { onConflict: "row_id" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "litmus.niche" });
  revalidatePath("/sheet/litmus");
}

/** 市場フィットの自己評価（◎○△×）と、手の入れ方のメモ・大きさ（金額か件数）を保存 */
export async function saveMarket(formData: FormData) {
  const { supabase, company, user } = await requireStage("litmus");
  const rowId = String(formData.get("row_id"));
  const { data: row } = await supabase.from("sheet_rows").select("id, created_at").eq("id", rowId).eq("company_id", company.id).maybeSingle();
  if (!row) return;
  const rec: Record<string, unknown> = { row_id: rowId, scored_by: "customer", scored_at: new Date().toISOString() };
  const marks: Partial<Record<AxisKey, number>> = {};
  for (const a of MARKET_AXES) {
    const raw = String(formData.get(a.key) ?? "");
    const n = ["0", "1", "2", "3"].includes(raw) ? Number(raw) : null;
    if (n !== null) marks[a.key] = n;
    rec[a.key] = a.key === "common_sense" ? (n === null ? null : String(n)) : n;
  }
  rec.total = marketTotal(marks).total;
  rec.magnitude_text = cut(String(formData.get("magnitude_text") ?? "").trim(), 300) || null;
  rec.zougenjofu = cut(String(formData.get("adjust_note") ?? "").trim(), MAX.value) || null;
  // 封（確認セッション②）：封の時点で御社が付けていた点数を変えるときは、理由が要る（大きさ・メモは対象外）
  const { data: prev } = await supabase.from("litmus_market").select(MARKET_AXES.map((a) => a.key).join(", ")).eq("row_id", rowId).eq("scored_by", "customer").maybeSingle();
  if (!(await sealGate({ supabase, companyId: company.id, userId: user.id, formData, changes: [{ column: "litmus_market.score", rowId, createdAt: row.created_at, before: marketText(prev as Record<string, unknown> | null), after: marketText(rec) }] }))) sealRetry("/sheet/litmus");
  await supabase.from("litmus_market").upsert(rec, { onConflict: "row_id,scored_by" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "litmus.market" });
  revalidatePath("/sheet/litmus");
}
