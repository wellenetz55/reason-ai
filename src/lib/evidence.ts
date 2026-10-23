/** STEP 7 の証拠の種類。強い順（実名の声 → 公開の声 → 第三者の数字・認定 → 自社の事実） */
export const EVIDENCE_KINDS = [
  { key: "named_voice", label: "お客様の実名の声（許諾あり）", short: "実名の声", strength: "strong" },
  { key: "public_voice", label: "公開されているお客様の声", short: "公開の声", strength: "mid" },
  { key: "third_party", label: "第三者の数字・認定", short: "第三者", strength: "mid" },
  { key: "own_fact", label: "自社の事実", short: "自社の事実", strength: "weak" },
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]["key"];
export const KIND_SET = new Set<string>(EVIDENCE_KINDS.map((k) => k.key));
export const KIND_SHORT: Record<string, string> = Object.fromEntries(EVIDENCE_KINDS.map((k) => [k.key, k.short]));
export const STRENGTH_OF: Record<string, string> = Object.fromEntries(EVIDENCE_KINDS.map((k) => [k.key, k.strength]));
export const STRENGTH_LABEL: Record<string, string> = { strong: "強", mid: "中", weak: "弱" };

/** 裏づける主張の参照：'row'＝STEP 5 の「なぜなら」、'brake:<id>'＝STEP 4 の⑥ */
export const CLAIM_RE = /^(row|brake:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** 組の「裏づけたい主張」を作る（画面とAIの対象で同じものを使う）。STEP 5 のなぜなら＋STEP 4 の⑤⑥（答えか根拠のどちらかがあれば） */
export type Claim = { ref: string; label: string; text: string; tag: string; brakeWords?: string };
export function buildClaims(
  row: { because_phrase: string | null; because_tag?: string | null },
  brakes: { id: string; customer_words?: string | null; counter_message: string | null; because: string | null; because_tag?: string | null }[],
): Claim[] {
  return [
    ...(row.because_phrase?.trim() ? [{ ref: "row", label: "なぜなら（STEP 5）", text: row.because_phrase, tag: row.because_tag ?? "hypothesis" }] : []),
    ...brakes.filter((b) => b.counter_message?.trim() || b.because?.trim()).map((b) => ({
      ref: `brake:${b.id}`, label: "ブレーキへの答え（STEP 4）",
      text: [b.counter_message?.trim(), b.because?.trim() ? `なぜなら ${b.because.trim()}` : ""].filter(Boolean).join("　"),
      tag: b.because_tag ?? "hypothesis", brakeWords: b.customer_words ?? "",
    })),
  ];
}

/** AIが一度探した組の印：組のidと、そのときの主張の中身から作る（主張を書き直したら、もう一度探せる） */
export function triedKey(rowId: string, claims: { text: string }[]): string {
  let h = 5381;
  for (const ch of claims.map((c) => c.text).join("\u0001")) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `${rowId}:${h.toString(36)}`;
}
