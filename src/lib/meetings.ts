export const MEETING_LABEL: Record<string, string> = {
  kickoff: "キックオフ",
  session1: "確認セッション①",
  midcheck: "中間チェック",
  session2: "確認セッション②",
  session3: "確認セッション③",
  advisor_monthly: "顧問 月次",
  internal: "社内",
};

/** JSTで "10/13（月）14:00" の形に */
export function fmtMeeting(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }).format(d); // 10/13(月)
  const time = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).format(d);
  return `${date.replace("(", "（").replace(")", "）")} ${time}`;
}

/** datetime-local の初期値用（JST） */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
