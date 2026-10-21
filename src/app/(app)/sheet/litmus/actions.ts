"use server";
import { revalidatePath } from "next/cache";
import { requireStage } from "@/server/stageGuard";
import { draftLitmus } from "@/server/litmus";
import { loadProfileContext } from "@/server/profile";
import { aiGuard } from "@/server/aiGuard";
import { createAdminClient } from "@/lib/supabase/admin";
import { MARKET_AXES, marketTotal, type AxisKey } from "@/lib/litmus";
import { MAX, cut } from "@/lib/limits";

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
  const { data: row } = await supabase.from("sheet_rows").select("id").eq("id", rowId).eq("company_id", company.id).maybeSingle();
  if (!row) return;
  await supabase.from("litmus_niche").upsert({ row_id: rowId, q1_pain_urgency: v("q1"), q2_actively_seeking: v("q2"), judged_by: "customer", updated_at: new Date().toISOString() }, { onConflict: "row_id" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "litmus.niche" });
  revalidatePath("/sheet/litmus");
}

/** 市場フィットの自己評価（◎○△×）と、手の入れ方のメモ・大きさ（金額か件数）を保存 */
export async function saveMarket(formData: FormData) {
  const { supabase, company, user } = await requireStage("litmus");
  const rowId = String(formData.get("row_id"));
  const { data: row } = await supabase.from("sheet_rows").select("id").eq("id", rowId).eq("company_id", company.id).maybeSingle();
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
  await supabase.from("litmus_market").upsert(rec, { onConflict: "row_id,scored_by" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "litmus.market" });
  revalidatePath("/sheet/litmus");
}
