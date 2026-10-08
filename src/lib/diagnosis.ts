export const BRAKE_LABEL: Record<string, string> = {
  distrust: "不信（本当かな）",
  unnecessary: "不要（必要ないかも）",
  unfit: "不適（うちには合わないかも）",
  nourgent: "不急（今じゃなくても）",
};

/** 適合診断で見ている条件（顧客向けに、面談の発言を引用して示す） */
export const FIT_CONDITIONS = [
  "すでに御社を選んでくれているお客様がいる",
  "経営者ご自身が「言葉」を決める意思をお持ちである",
  "競合との差が実際にあるのに、まだ言葉になっていない",
  "8週間、週に1〜2時間を確保できる",
  "社内に一緒に考える人が1人以上いる",
];

export const TAG_LABEL: Record<string, string> = { fact: "事実", verify: "要確認", hypothesis: "仮説" };
