/** 4つの不（お客様のブレーキ）の種類。表示名・一行定義・買い手の言葉の例 */
export const BRAKE_KINDS = [
  { key: "distrust", label: "不信", one: "本当か？　信じられない", ask: "「それは本当なのか」「うちの場合も同じようにいくのか」と疑う気持ち", example: "数字はきれいだけど、うちの規模でも同じ結果が出るのか" },
  { key: "unnecessary", label: "不要", one: "今のままで困っていない", ask: "「それが無くても回っている」「困っていない」と感じる気持ち", example: "今の取引先で特に不満はない。変える理由がない" },
  { key: "unfit", label: "不適", one: "うちには合わない", ask: "「自分（自社）には合わない」「大手向け・小さい会社向けだろう」と感じる気持ち", example: "うちの業界は特殊だから、一般的なやり方は合わないと思う" },
  { key: "nourgent", label: "不急", one: "今じゃなくていい", ask: "「必要かもしれないが、今やる理由がない」と先延ばしにする気持ち", example: "検討はしたいが、今期は予算も時間も無い。来期でいい" },
] as const;
export type BrakeKind = (typeof BRAKE_KINDS)[number]["key"];
export const BRAKE_LABEL: Record<string, string> = Object.fromEntries(BRAKE_KINDS.map((k) => [k.key, k.label]));

/** 出所タグ（どこから拾った言葉か）。公開の声は原文をシートの外に出さない */
export const BRAKE_SOURCES = [
  { key: "customer_voice", label: "お客様の声（アンケート・面談）" },
  { key: "meeting", label: "面談記録・議事録" },
  { key: "website", label: "公式サイト・資料" },
  { key: "public_voice", label: "公開の声（レビュー・コメント）" },
  { key: "own", label: "自社の実感" },
  { key: "ai", label: "AIの推測" },
] as const;
export const BRAKE_SOURCE_LABEL: Record<string, string> = Object.fromEntries(BRAKE_SOURCES.map((s) => [s.key, s.label]));

export const EVIDENCE_TAG_LABEL: Record<string, string> = { fact: "事実", verify: "要確認", hypothesis: "仮説" };
