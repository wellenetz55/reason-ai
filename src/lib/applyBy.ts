/**
 * 申し込みの期限：公開日（日本時間）の1か月後の日の 23:59（日本時間）。
 * 月末は丸める（1/31 → 2/28）。サーバのタイムゾーンに左右されないよう、日本時間の年月日で計算する
 */
export function oneMonthLaterJst(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 3600_000); // UTC の各フィールド＝日本時間の年月日
  const y = jst.getUTCFullYear(), m = jst.getUTCMonth(), d = jst.getUTCDate();
  const last = new Date(Date.UTC(y, m + 2, 0)).getUTCDate(); // 翌月の末日
  // 日本時間 23:59 ＝ UTC 14:59
  return new Date(Date.UTC(y, m + 1, Math.min(d, last), 14, 59)).toISOString();
}

/** 期限の表示（例：12月3日）。日本時間 */
export const fmtApplyBy = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" });
