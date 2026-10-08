export type Stage = {
  key: string;
  step: string; // "STEP 1" など。左メニューのラベル
  label: string;
  href: string;
  statuses: string[]; // company statuses in which this stage is open
};

export const STAGES: Stage[] = [
  { key: "step0", step: "STEP 0", label: "会社を知る", href: "/step0", statuses: ["onboarding", "week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "diverge", step: "STEP 1", label: "提供価値を出す", href: "/sheet/diverge", statuses: ["week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "merge", step: "STEP 2", label: "まとめて絞る", href: "/sheet/merge", statuses: ["week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "brakes", step: "STEP 3", label: "お客様のブレーキ", href: "/sheet/brakes", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "counter", step: "STEP 4", label: "ブレーキを外す", href: "/sheet/counter", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "trust", step: "STEP 5", label: "体験価値を磨く", href: "/sheet/trust", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "litmus", step: "STEP 6", label: "試験紙", href: "/sheet/litmus", statuses: ["week3_5", "week6_8", "extended", "grace", "advisor"] },
  { key: "evidence", step: "STEP 7", label: "証拠を集める", href: "/sheet/evidence", statuses: ["week6_8", "extended", "grace", "advisor"] },
  { key: "deploy", step: "FINAL", label: "接点に展開する", href: "/deploy", statuses: ["week6_8", "extended", "grace", "advisor"] },
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

/** 会社の状態（と発散行数）から、いま進める段階を返す。ホームと左メニューで共用 */
export function currentStep(status: string, rows: number) {
  switch (status) {
    case "onboarding":
      return { key: "step0", title: "会社資料を上げる", body: "会社案内やWebサイトを登録すると、AIが御社の説明の下書きを作ります。それを直すところから始まります。" };
    case "week1_2":
      return rows < 20
        ? { key: "diverge", title: "提供価値を出す", body: `御社が「できること」を思いつく限り書き出す段階です。あと${20 - rows}行で次に進めます（目標30行）。` }
        : { key: "merge", title: "まとめて絞る", body: `提供価値が${rows}行そろいました。似たものをまとめ、残す言葉を選ぶ段階です。` };
    case "week3_5":
      return { key: "brakes", title: "お客様のブレーキを書き出す", body: "お客様が御社を選ぶ直前に感じる不安や迷いを書き出し、先回りの答えを用意する段階です。" };
    case "week6_8":
    case "extended":
      return { key: "evidence", title: "証拠を集める", body: "ここまで決めた言葉の裏づけ（お客様の声・数字・事実）を集め、営業やWebの言葉に展開する段階です。" };
    case "grace":
    case "advisor":
      return { key: "deploy", title: "接点に展開する", body: "完成した提供価値を、営業トーク・価格説明・Webなどの言葉に変換する段階です。" };
    case "locked":
      return { key: "", title: "シートの閲覧", body: "完成した提供価値シートの閲覧とダウンロードができます。" };
    default:
      return { key: "", title: "準備中", body: "ベレネッツからの案内をお待ちください。" };
  }
}
