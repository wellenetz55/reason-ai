import type { SupabaseClient } from "@supabase/supabase-js";
import type { GateCtx } from "@/lib/gates";

/** 顧客のステップ進行判定に必要な数を一度に集める */
export async function loadGateCtx(supabase: SupabaseClient, companyId: string, status: string): Promise<GateCtx> {
  const [{ data: progress }, { data: brakes }, { data: ev }, step0Ready] = await Promise.all([
    supabase.from("v_divergence_progress").select("row_count, pair_count").eq("company_id", companyId).maybeSingle(),
    supabase.from("brakes").select("kind, counter_message, status, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId).eq("status", "active"),
    supabase.from("evidences").select("id, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId),
    isStep0Ready(supabase, companyId),
  ]);
  const kinds = new Set((brakes ?? []).map((b) => b.kind));
  return {
    status,
    rows: progress?.pair_count ?? 0,
    rowsAll: progress?.row_count ?? 0,
    brakeKinds: kinds.size,
    brakesOpen: (brakes ?? []).filter((b) => !b.counter_message?.trim()).length,
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
