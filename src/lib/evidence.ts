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
