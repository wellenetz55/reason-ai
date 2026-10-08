/** 7つの面（問いの角度）。固定の名称とヒントのみ。問いの本文は method_facets（DB）にある */
export const FACETS = [
  { key: "functional", short: "機能", label: "機能的側面", hint: "何ができるか。数字・設備・仕組み・対応範囲。" },
  { key: "emotional", short: "情緒", label: "情緒的側面", hint: "お客様がどう感じるか。安心・誇り・解放・所属。" },
  { key: "by_target", short: "相手別", label: "ターゲット別", hint: "相手が変わると価値が変わる。担当者・経営者・利用者。" },
  { key: "by_trigger", short: "入口", label: "気持ちの入口", hint: "願望・恐れ・イライラから探す。" },
  { key: "competitor_gap", short: "競合", label: "競合の裏返し", hint: "向こうが言っていないこと・できていないこと。" },
  { key: "voice", short: "声", label: "顧客と社員の声", hint: "レビュー、問い合わせ、クレーム、社員が良いと言うこと。" },
  { key: "history", short: "経緯", label: "創業の経緯", hint: "なぜ始めたか、何を捨ててきたか。" },
] as const;

export type FacetKey = (typeof FACETS)[number]["key"];
