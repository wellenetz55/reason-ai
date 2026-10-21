import type { SupabaseClient } from "@supabase/supabase-js";
import type { GateCtx } from "@/lib/gates";
import { hasHole } from "@/lib/counter";
import { currentStep, week35Step } from "@/lib/stages";

/** 顧客のステップ進行判定に必要な数を一度に集める */
export async function loadGateCtx(supabase: SupabaseClient, companyId: string, status: string): Promise<GateCtx> {
  const [{ data: progress }, { data: brakes }, { data: ev }, step0Ready] = await Promise.all([
    supabase.from("v_divergence_progress").select("row_count, pair_count").eq("company_id", companyId).maybeSingle(),
    // 却下・保留した組のブレーキは数えない（使わない組で「4種類そろった」にしない）
    supabase.from("brakes").select("kind, counter_message, because, status, sheet_rows!inner(company_id, status)").eq("sheet_rows.company_id", companyId).eq("sheet_rows.status", "active").eq("status", "active"),
    supabase.from("evidences").select("id, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId),
    isStep0Ready(supabase, companyId),
  ]);
  const kinds = new Set((brakes ?? []).map((b) => b.kind));
  return {
    status,
    rows: progress?.pair_count ?? 0,
    rowsAll: progress?.row_count ?? 0,
    brakeKinds: kinds.size,
    // 答えが無い、または ○ の穴が残っている答えは「まだ外れていない」
    brakesTotal: (brakes ?? []).length,
    brakesOpen: (brakes ?? []).filter((b) => !b.counter_message?.trim() || hasHole(b.counter_message) || hasHole(b.because)).length,
    evidences: (ev ?? []).length,
    step0Ready,
  };
}

/** STEP 0 に何か入っているか：資料・URLが1つ以上、または会社の説明（承認・修正済み）が1項目以上 */
export async function isStep0Ready(supabase: SupabaseClient, companyId: string): Promise<boolean> {
  const [{ count: docs }, { count: items }] = await Promise.all([
    supabase.from("company_documents").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("profile_items").select("key", { count: "exact", head: true }).eq("company_id", companyId).in("status", ["approved", "fixed"]),
  ]);
  return (docs ?? 0) > 0 || (items ?? 0) > 0;
}

/** いま進める段階（ホームの「いま進めること」と左メニューの点滅に使う）。3〜5週目だけは進み具合を見て決める */
export async function loadNowStep(supabase: SupabaseClient, companyId: string, status: string, pairs: number) {
  if (status !== "week3_5") return currentStep(status, pairs);
  const [ctx, { data: rows }, { data: niche }, { data: market }] = await Promise.all([
    loadGateCtx(supabase, companyId, status),
    supabase.from("sheet_rows").select("id, value_raw, because_phrase").eq("company_id", companyId).eq("status", "active"),
    supabase.from("litmus_niche").select("row_id, q1_pain_urgency, q2_actively_seeking, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId),
    supabase.from("litmus_market").select("row_id, scored_by, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId).eq("scored_by", "customer"),
  ]);
  const live = (rows ?? []).filter((r) => r.value_raw);
  const answered = new Set((niche ?? []).filter((n) => n.q1_pain_urgency !== null || n.q2_actively_seeking !== null).map((n) => n.row_id));
  const scored = new Set((market ?? []).map((m) => m.row_id));
  return week35Step({
    brakes: ctx.brakeKinds >= 4,
    counter: (ctx.brakesTotal ?? 0) > 0 && ctx.brakesOpen === 0,
    trust: live.length > 0 && live.every((r) => r.because_phrase?.trim()),
    litmus: live.length > 0 && live.every((r) => answered.has(r.id) && scored.has(r.id)),
  });
}

