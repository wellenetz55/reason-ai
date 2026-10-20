import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * キックオフの候補日と確定日を、2つの置き場所からまとめて読む。
 * - 「適合診断の結果を書く」6. の候補日（diagnosis_results.candidate_dates）
 * - 会社ページの「面談」に登録したキックオフ（company_meetings.kind=kickoff・未実施）
 * どちらに入れても、お客様には同じように候補として出る。
 * 候補が1つだけで未選択なら「確定」とみなす（電話などで決めたあと、ベレネッツが面談に入れた場合）。
 */
export async function loadKickoff(companyId: string): Promise<{ candidates: string[]; chosen: string | null }> {
  const admin = createAdminClient();
  const now = Date.now();
  const [{ data: d }, { data: ms }] = await Promise.all([
    admin.from("diagnosis_results").select("candidate_dates, chosen_date").eq("company_id", companyId).maybeSingle(),
    admin.from("company_meetings").select("scheduled_at").eq("company_id", companyId).eq("kind", "kickoff").is("held_at", null),
  ]);
  if (d?.chosen_date) return { candidates: [], chosen: d.chosen_date as string };
  const fromResults = ((d?.candidate_dates ?? []) as string[]).map((x) => new Date(x)).filter((t) => t.getTime() > now);
  const fromMeetings = (ms ?? []).map((m) => new Date(m.scheduled_at as string)).filter((t) => t.getTime() > now);
  const all = [...new Set([...fromResults, ...fromMeetings].map((t) => t.toISOString()))].sort();
  // 結果ページに候補が無く、面談に未来のキックオフが1件だけ → 日程は決まっているとみなす
  if (fromResults.length === 0 && fromMeetings.length === 1) return { candidates: [], chosen: all[0] };
  return { candidates: all.slice(0, 5), chosen: null };
}
