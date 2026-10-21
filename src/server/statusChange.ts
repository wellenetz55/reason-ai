import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUS_LABEL } from "@/lib/stages";

const IN_PROGRESS = ["onboarding", "week1_2", "week3_5", "week6_8", "extended"];

/**
 * 会社の状態を変える本体（ベレネッツの操作・面談実施の自動前進・毎朝の自動処理で共用）。
 * 状態の更新に失敗したら後処理はせず false。同じ状態なら何もしない。
 * extra: 状態と一緒に書く列（advisor_since など）
 */
export async function changeStatus(supabase: SupabaseClient, id: string, status: string, extra: Record<string, string> = {}): Promise<boolean> {
  if (!(status in STATUS_LABEL)) return false;
  const { data: before } = await supabase.from("companies").select("status").eq("id", id).single();
  if (!before || before.status === status) return false;
  const nowD = new Date();
  const now = nowD.toISOString();
  const patch: Record<string, string> = { status, status_changed_at: now, ...extra };
  // 猶予・延長は終わりの日を決める（毎朝の自動処理がこの日を過ぎたら次の状態に移す）。期限は会社ページで変えられる
  if (status === "grace") { const d = new Date(nowD); d.setMonth(d.getMonth() + 1); patch.grace_until = d.toISOString(); }
  if (status === "extended") patch.extension_until = new Date(nowD.getTime() + 28 * 86_400_000).toISOString();
  const { error } = await supabase.from("companies").update(patch).eq("id", id);
  if (error) return false;
  // 進行中の状態を抜けたら「7日操作なし」は済みにする（毎朝の処理は進行中の会社しか見ないため）
  if (!IN_PROGRESS.includes(status)) {
    await supabase.from("alerts").update({ resolved_at: now }).eq("company_id", id).eq("kind", "stale7").is("resolved_at", null);
  }
  // 状態が変わったら、解約後の一時再アクセスは閉じる（列が無い環境ではエラーを無視）
  await supabase.from("companies").update({ reaccess_until: null }).eq("id", id).not("reaccess_until", "is", null);
  if (status !== "week1_2") await supabase.from("alerts").update({ resolved_at: now }).eq("company_id", id).is("resolved_at", null).contains("payload", { type: "step2_done" });
  // 契約前を抜けたら、契約前の要対応アラート（申込・診断閲覧・キックオフ選択）を済みにする
  if (status !== "diagnosed") {
    for (const type of ["program_applied", "diagnosis_viewed", "kickoff_chosen"]) {
      await supabase.from("alerts").update({ resolved_at: now }).eq("company_id", id).is("resolved_at", null).contains("payload", { type });
    }
  }
  return true;
}
