"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/session";
import { MARKET_AXES, marketTotal, type AxisKey } from "@/lib/litmus";
import { cut } from "@/lib/limits";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (companyId: string, q: string) => redirect(`/admin/${companyId}/litmus?${q}`);

/** その行がその会社のものか（URLのcompany_idと行の会社を突き合わせる） */
async function rowOf(supabase: Awaited<ReturnType<typeof requireOperator>>["supabase"], companyId: string, rowId: string) {
  if (!UUID.test(companyId) || !UUID.test(rowId)) return null;
  const { data } = await supabase.from("sheet_rows").select("id").eq("id", rowId).eq("company_id", companyId).maybeSingle();
  return data;
}

const mark = (raw: FormDataEntryValue | null) => { const s = String(raw ?? ""); return ["0", "1", "2", "3"].includes(s) ? Number(s) : null; };

/** ベレネッツの採点を1組ぶん保存（◎○△×・大きさ・回天のステップ・手の入れ方・仮順位） */
export async function saveOperatorScore(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = String(formData.get("company_id") ?? "");
  const rowId = String(formData.get("row_id") ?? "");
  if (!(await rowOf(supabase, companyId, rowId))) return back(companyId, "error=" + encodeURIComponent("この会社の組が見つかりませんでした"));
  const rec: Record<string, unknown> = { row_id: rowId, scored_by: "operator", scored_at: new Date().toISOString() };
  const marks: Partial<Record<AxisKey, number>> = {};
  for (const a of MARKET_AXES) {
    const n = mark(formData.get(a.key));
    if (n !== null) marks[a.key] = n;
    rec[a.key] = a.key === "common_sense" ? (n === null ? null : String(n)) : n;
  }
  const mag = mark(formData.get("magnitude_score"));
  rec.magnitude_score = mag;
  rec.total = marketTotal(marks).total + (mag ?? 0);
  const k = Number(formData.get("kaiten_step"));
  rec.kaiten_step = Number.isInteger(k) && k >= 1 && k <= 5 ? k : null;
  const r = Number(formData.get("rank"));
  rec.rank = String(formData.get("rank") ?? "").trim() !== "" && Number.isInteger(r) && r >= 1 && r <= 999 ? r : null;
  rec.zougenjofu = cut(String(formData.get("zougenjofu") ?? "").trim(), 1000) || null;
  rec.magnitude_text = cut(String(formData.get("magnitude_text") ?? "").trim(), 500) || null;
  // 回天のステップ・仮順位はログイン中のロールからは読めない列なので、確かめたあとサーバ側で書く
  const { error } = await createAdminClient().from("litmus_market").upsert(rec, { onConflict: "row_id,scored_by" });
  if (error) return back(companyId, "error=" + encodeURIComponent(`保存できませんでした${/rank/.test(error.message) ? "（SQL 0039 が未実行の可能性があります）" : ""}：${error.message}`) + `#r-${rowId}`);
  await supabase.from("activity_log").insert({ company_id: companyId, user_id: user.id, event: "admin.litmus.score", payload: { row_id: rowId } });
  revalidatePath(`/admin/${companyId}/litmus`);
  back(companyId, `notice=${encodeURIComponent("保存しました")}#r-${rowId}`);
}

/** 仮順位をお客様のシート（sheet_rows.rank）に確定する。仮順位の無い組は順位を外す。1位を主役（is_primary）にする */
export async function confirmRanking(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = String(formData.get("company_id") ?? "");
  if (!UUID.test(companyId)) return;
  const [{ data: rows }, { data: ops }] = await Promise.all([
    supabase.from("sheet_rows").select("id").eq("company_id", companyId).eq("status", "active"),
    createAdminClient().from("litmus_market").select("row_id, rank, sheet_rows!inner(company_id)").eq("scored_by", "operator").eq("sheet_rows.company_id", companyId),
  ]);
  const rankOf = new Map((ops ?? []).filter((o) => o.rank != null).map((o) => [o.row_id as string, o.rank as number]));
  if (rankOf.size === 0) return back(companyId, "error=" + encodeURIComponent("仮順位がまだ1つも入っていません"));
  const nums = [...rankOf.values()];
  if (new Set(nums).size !== nums.length) return back(companyId, "error=" + encodeURIComponent("同じ順位が2つ以上あります。重ならないように直してから確定してください"));
  const top = Math.min(...nums);
  // 全行を一度外してから付け直す（順位は active の行だけ）
  const { error: e1 } = await supabase.from("sheet_rows").update({ rank: null, is_primary: false }).eq("company_id", companyId);
  if (e1) return back(companyId, "error=" + encodeURIComponent(`確定できませんでした：${e1.message}`));
  for (const r of rows ?? []) {
    const n = rankOf.get(r.id);
    if (n === undefined) continue;
    await supabase.from("sheet_rows").update({ rank: n, is_primary: n === top }).eq("id", r.id).eq("company_id", companyId);
  }
  await supabase.from("activity_log").insert({ company_id: companyId, user_id: user.id, event: "admin.litmus.rank", payload: { n: rankOf.size } });
  revalidatePath(`/admin/${companyId}/litmus`);
  revalidatePath(`/admin/${companyId}`);
  back(companyId, `notice=${encodeURIComponent(`${rankOf.size}組の順位をお客様のシートに確定しました`)}`);
}

/** ベレネッツの合計点が高い順に仮順位を入れ直す（同点は御社の自己評価の合計で。2問とも「いいえ」の保留候補と、未採点の組は順位を外す） */
export async function autoRank(formData: FormData) {
  const { supabase } = await requireOperator();
  const companyId = String(formData.get("company_id") ?? "");
  if (!UUID.test(companyId)) return;
  const [{ data: rows }, { data: market }, { data: niche }] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq").eq("company_id", companyId).eq("status", "active"),
    supabase.from("litmus_market").select("row_id, scored_by, total, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId),
    supabase.from("litmus_niche").select("row_id, q1_pain_urgency, q2_actively_seeking, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId),
  ]);
  const op = new Map((market ?? []).filter((m) => m.scored_by === "operator").map((m) => [m.row_id as string, m.total as number | null]));
  const cu = new Map((market ?? []).filter((m) => m.scored_by === "customer").map((m) => [m.row_id as string, (m.total as number | null) ?? 0]));
  const hold = new Set((niche ?? []).filter((n) => n.q1_pain_urgency === false && n.q2_actively_seeking === false).map((n) => n.row_id as string));
  const ranked = (rows ?? [])
    .filter((r) => op.has(r.id) && op.get(r.id) != null && !hold.has(r.id))
    .sort((a, b) => (op.get(b.id)! - op.get(a.id)!) || ((cu.get(b.id) ?? 0) - (cu.get(a.id) ?? 0)) || a.seq - b.seq);
  if (!ranked.length) return back(companyId, "error=" + encodeURIComponent("ベレネッツの採点が入った組がまだありません"));
  const pos = new Map(ranked.map((r, i) => [r.id, i + 1]));
  const admin = createAdminClient();
  for (const r of rows ?? []) {
    if (!op.has(r.id)) continue;
    await admin.from("litmus_market").update({ rank: pos.get(r.id) ?? null }).eq("row_id", r.id).eq("scored_by", "operator");
  }
  revalidatePath(`/admin/${companyId}/litmus`);
  back(companyId, `notice=${encodeURIComponent(`合計点の高い順に${ranked.length}組へ仮順位を入れました（まだお客様のシートには出ていません）`)}`);
}
