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

/** 左メニューで、どのステップの直後にベレネッツの面談を挟むか（kickoff は STEP 0 の前） */
export const MEETING_AFTER_STEP: Record<string, { kind: string; label: string }> = {
  merge: { kind: "session1", label: "確認セッション①" },
  counter: { kind: "midcheck", label: "中間チェック" },
  litmus: { kind: "session2", label: "確認セッション②" },
  deploy: { kind: "session3", label: "確認セッション③" },
};

/** 面談を実施済みにしたとき、プログラムの状態をどこからどこへ進めるか（operator 操作の一部） */
export const ADVANCE_AFTER_MEETING: Record<string, { from: string[]; to: string }> = {
  kickoff: { from: ["diagnosed", "onboarding"], to: "week1_2" },
  session1: { from: ["week1_2"], to: "week3_5" },
  session2: { from: ["week3_5"], to: "week6_8" },
};
