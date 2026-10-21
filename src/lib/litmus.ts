/** STEP 6 の評価の段階（◎○△×）。DBには 3/2/1/0 で保存する */
export const MARKS = [
  { v: 3, label: "◎" },
  { v: 2, label: "○" },
  { v: 1, label: "△" },
  { v: 0, label: "×" },
] as const;
export const MARK_LABEL: Record<number, string> = { 3: "◎", 2: "○", 1: "△", 0: "×" };

/** ニッチの2問（はい／いいえ／わからない） */
export const NICHE_QUESTIONS = [
  { key: "q1", col: "q1_pain_urgency", ai: "ai_q1", text: "見込み客は、この悩みに苦痛と緊急性を感じていますか（あるいは、理屈を超えた情熱を持っていますか）" },
  { key: "q2", col: "q2_actively_seeking", ai: "ai_q2", text: "見込み客は、自分から進んで解決策を探していますか" },
] as const;

/** 市場フィットの軸（◎○△×）。common_sense は text 列に "3"〜"0" で入れる */
export const MARKET_AXES = [
  { key: "common_sense", label: "業界の常識・非常識", hint: "業界の常識をくつがえす（非常識な）ほど、覚えてもらいやすい" },
  { key: "investment", label: "投資価値", hint: "お金・時間をかけて伸ばす価値があるか" },
  { key: "strength_asset", label: "強み・資産", hint: "御社がすでに持っている強みや資産で裏づけられるか" },
  { key: "feasibility", label: "実現可能性", hint: "約束どおりに、いつでも実行できるか" },
  { key: "beat_competitor", label: "競合に勝てそうか", hint: "比べられる相手より、はっきり上と言えるか" },
  { key: "internal_passion", label: "社内の熱意", hint: "社内の人が本気で語れる・続けたいと思えるか" },
  { key: "brand_purpose_fit", label: "ブランドの目的と合っているか", hint: "御社がこの8週間で目指す姿に沿っているか" },
] as const;
export type AxisKey = (typeof MARKET_AXES)[number]["key"];

/** ◎○△× の合計（未入力は数えない）と、入力済みの軸数 */
export function marketTotal(r: Partial<Record<AxisKey, number | string | null>>): { total: number; filled: number } {
  let total = 0, filled = 0;
  for (const a of MARKET_AXES) {
    const v = r[a.key];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) { total += n; filled++; }
  }
  return { total, filled };
}
