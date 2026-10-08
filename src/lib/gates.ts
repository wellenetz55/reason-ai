import { STAGES } from "@/lib/stages";

export type GateCtx = {
  status: string;
  rows: number;          // 対になっている組数（提供価値＋体験価値が両方ある行）
  rowsAll: number;       // 行数（体験価値が空の行も含む）
  brakeKinds: number;    // 書き出したブレーキの種類数（最大4）
  brakesOpen: number;    // 先回りの答えがまだないブレーキ数
  evidences: number;     // 集めた証拠の数
};

export type Gate = {
  next?: { key: string; step: string; label: string; href: string };
  ready: boolean;
  note: string;          // 進める条件、または進めない理由を一文で
  byOperator?: boolean;  // ベレネッツ側の操作（面談）で開くステップか
};

const order = ["onboarding", "week1_2", "week3_5", "week6_8", "extended", "grace", "advisor"];
const atLeast = (status: string, s: string) => order.indexOf(status) >= order.indexOf(s);

/**
 * 各ステップから次へ進める条件。
 * 自分で満たせる条件（行数など）と、ベレネッツとの面談で開く条件（status）を分けて文で返す。
 */
export function stepGate(key: string, c: GateCtx): Gate {
  const i = STAGES.findIndex((s) => s.key === key);
  const n = STAGES[i + 1];
  const next = n ? { key: n.key, step: n.step, label: n.label, href: n.href } : undefined;
  switch (key) {
    case "step0":
      return atLeast(c.status, "week1_2")
        ? { next, ready: true, note: "会社の説明を直し終えたら、提供価値の書き出しに進めます。" }
        : { next, ready: false, byOperator: true, note: "キックオフ面談のあと、ベレネッツが次のステップを開きます。" };
    case "diverge":
      return c.rows >= 20
        ? { next, ready: true, note: c.rows >= 30 ? `${c.rows}組。出し切りました。` : `${c.rows}組。目標の30組まで出すと、絞ったあとに残る言葉が強くなります。進んでから戻って足すこともできます。` }
        : { next, ready: false, note: `あと${20 - c.rows}組で進めます（目標30組）。${c.rowsAll > c.rows ? `体験価値が空の行が${c.rowsAll - c.rows}行あります。「だから、お客様は…」を埋めると組になります。` : ""}` };
    case "merge":
      return atLeast(c.status, "week3_5")
        ? { next, ready: true, note: "絞った言葉をベレネッツが確認済みです。お客様のブレーキに進めます。" }
        : { next, ready: false, byOperator: true, note: "絞った言葉を確認セッション①でベレネッツが確認したあと、次のステップが開きます。" };
    case "brakes":
      return c.brakeKinds >= 4
        ? { next, ready: true, note: "4種類のブレーキがそろいました。" }
        : { next, ready: false, note: `4種類のブレーキを1つ以上ずつ書き出すと進めます（いま${c.brakeKinds}種類）。` };
    case "counter":
      return c.brakesOpen === 0
        ? { next, ready: true, note: "すべてのブレーキに先回りの答えがつきました。" }
        : { next, ready: false, note: `答えがまだないブレーキが${c.brakesOpen}件あります。全部につけると進めます。` };
    case "trust":
      return { next, ready: true, note: "体験価値を見直し終えたら、リトマス試験紙に進んでください。あとから戻って磨き直せます。" };
    case "litmus":
      return atLeast(c.status, "week6_8")
        ? { next, ready: true, note: "確認セッション②を終えています。証拠集めに進めます。" }
        : { next, ready: false, byOperator: true, note: "リトマス試験紙の結果を確認セッション②でベレネッツと見たあと、次のステップが開きます。" };
    case "evidence":
      return c.evidences >= 1
        ? { next, ready: true, note: `証拠が${c.evidences}件つきました。接点への展開に進めます。` }
        : { next, ready: false, note: "証拠を1件以上つけると、接点への展開に進めます。" };
    default:
      return { ready: false, note: "ここが最後のステップです。完成した言葉を、使う場面ごとに展開します。" };
  }
}
