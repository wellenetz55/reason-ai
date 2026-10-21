import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** AI呼び出しを包み、失敗を activity_log に残す（画面は落とさない）。戻り値 null = 失敗 */
/** 1社あたりのAI呼び出しの上限（直近10分・全機能合計）。連打やスクリプトで費用が膨らむのを防ぐ */
const AI_EVENTS = ["profile.draft", "row.draft", "vague_check.run", "vague_check.redraft", "because.draft", "brakes.draft", "counter.draft", "litmus.draft"];
const AI_LIMIT_10MIN = 30;

export async function aiGuard<T>(supabase: SupabaseClient, companyId: string, userId: string, event: string, fn: () => Promise<T>): Promise<T | null> {
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await supabase.from("activity_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", since)
    // 実際にAIへ送った回数（.start）だけを数える。成功・失敗・止めた記録は数えない（止めている間の再試行で上限が延び続けないように）
    .in("event", AI_EVENTS.map((e) => `${e}.start`));
  if ((count ?? 0) >= AI_LIMIT_10MIN) {
    await supabase.from("activity_log").insert({ company_id: companyId, user_id: userId, event: `${event}.error`, payload: { msg: "rate_limited" } });
    return null;
  }
  // 呼び出しを先に記録する（成功・失敗の記録が無い呼び出しも回数に数える）
  await supabase.from("activity_log").insert({ company_id: companyId, user_id: userId, event: `${event}.start` });
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
  if (msg === "rate_limited") return "短い時間にAIへの依頼が続いたため、いったん止めています。10分ほど置いてから、もう一度お試しください。";
  if (/timeout|timed out/i.test(msg)) return "時間内に下書きを作れませんでした。資料を減らすか、しばらくしてからもう一度お試しください。";
  return "下書きを作れませんでした。しばらくしてからもう一度お試しください。続くときは「エラーレポート」からお知らせください。";
}
