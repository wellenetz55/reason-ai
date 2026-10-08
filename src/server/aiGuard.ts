import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** AI呼び出しを包み、失敗を activity_log に残す（画面は落とさない）。戻り値 null = 失敗 */
export async function aiGuard<T>(supabase: SupabaseClient, companyId: string, userId: string, event: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await supabase.from("activity_log").insert({ company_id: companyId, user_id: userId, event: `${event}.error`, payload: { msg: msg.slice(0, 500) } });
    return null;
  }
}

/** 直近のAIエラーを顧客向けの文にする */
export async function lastAiError(supabase: SupabaseClient, companyId: string, event: string): Promise<string | null> {
  const { data } = await supabase.from("activity_log").select("event, payload, created_at").eq("company_id", companyId).in("event", [event, `${event}.error`]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data || data.event !== `${event}.error`) return null;
  const msg = String((data.payload as { msg?: string })?.msg ?? "");
  if (/credit balance/i.test(msg)) return "AIの利用枠が不足しているため、下書きを作れませんでした。ベレネッツ側で補充します。お手数ですが「ベレネッツに質問を残す」からお知らせください。";
  if (/timeout|timed out/i.test(msg)) return "時間内に下書きを作れませんでした。資料を減らすか、しばらくしてからもう一度お試しください。";
  return "下書きを作れませんでした。しばらくしてからもう一度お試しください。続くときは「エラーレポート」からお知らせください。";
}
