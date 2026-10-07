export type Stage = {
  key: string;
  label: string;
  href: string;
  statuses: string[]; // company statuses in which this stage is open
};

export const STAGES: Stage[] = [
  { key: "step0", label: "会社を知る", href: "/step0", statuses: ["onboarding", "week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "diverge", label: "提供価値を出す", href: "/sheet/diverge", statuses: ["week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "merge", label: "まとめて絞る", href: "/sheet/merge", statuses: ["week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "brakes", label: "お客様のブレーキ", href: "/sheet/brakes", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "counter", label: "ブレーキを外す", href: "/sheet/counter", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "trust", label: "体験価値を磨く", href: "/sheet/trust", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "litmus", label: "試験紙", href: "/sheet/litmus", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "evidence", label: "証拠を集める", href: "/sheet/evidence", statuses: ["week6_8", "extended", "grace", "advisor"] },
  { key: "deploy", label: "接点に展開する", href: "/deploy", statuses: ["week6_8", "extended", "grace", "advisor"] },
];

export const STATUS_LABEL: Record<string, string> = {
  diagnosed: "適合診断済み",
  onboarding: "キックオフ前",
  week1_2: "第1塗り（骨格）",
  week3_5: "第2塗り（肉付け）",
  week6_8: "第3塗り（仕上げ）",
  extended: "延長中",
  grace: "猶予期間",
  locked: "閲覧のみ",
  advisor: "顧問",
  cancelled: "解約",
};

export function isStageOpen(stage: Stage, status: string) {
  return stage.statuses.includes(status);
}
