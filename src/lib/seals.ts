/**
 * 封（確認セッションで確定した列）。仕様 00 §5。
 * 封をした列は、封をした時点で既にあった行について、理由を書いたときだけ直せる（変更は sheet_lock_history に残す）。
 * 封のあとに足した行・ブレーキは封の対象にしない。根拠の印が「事実」でない主張（仮封）は理由なしで直せる。
 */
export const SEAL_SESSIONS = [
  {
    key: "s1", label: "確認セッション①", what: "ターゲット・提供価値・体験価値（STEP 1・2 で残した組）",
    columns: ["sheet_rows.target", "sheet_rows.value_raw", "sheet_rows.experience_value_v1", "sheet_rows.status"],
  },
  {
    key: "s2", label: "確認セッション②", what: "ブレーキと先回りの答え（STEP 3・4）、磨いた体験価値となぜなら（STEP 5）、順位",
    columns: ["brakes.customer_words", "brakes.counter_message", "brakes.because", "brakes.because_tag", "brakes.status", "sheet_rows.experience_value", "sheet_rows.because_phrase", "sheet_rows.because_tag", "sheet_rows.rank"],
  },
  {
    key: "s3", label: "確認セッション③", what: "すべての列（①②の列に加え、②のあとに足した組・ブレーキと、採用した証拠）",
    columns: [
      "sheet_rows.target", "sheet_rows.value_raw", "sheet_rows.experience_value_v1", "sheet_rows.status",
      "brakes.customer_words", "brakes.counter_message", "brakes.because", "brakes.because_tag", "brakes.status",
      "sheet_rows.experience_value", "sheet_rows.because_phrase", "sheet_rows.because_tag", "sheet_rows.rank", "evidences.*",
    ],
  },
] as const;
export type SealKey = (typeof SEAL_SESSIONS)[number]["key"];
export const SEAL_LABEL: Record<string, string> = Object.fromEntries(SEAL_SESSIONS.map((s) => [s.key, s.label]));

export type Seal = { id: string; session: string; columns: string[]; locked_at: string; is_provisional: boolean };

/** 根拠の印で「仮封」になる列（印が事実でなければ、理由なしで直せる） */
// 印そのもの（because_tag）も封の対象。「事実」を下げると仮封になって理由なしで直せてしまうので、事実からの変更は理由が要る
export const TAGGED_COLUMNS = new Set(["brakes.counter_message", "brakes.because", "brakes.because_tag", "sheet_rows.because_phrase", "sheet_rows.because_tag"]);

/**
 * その列・その行に効いている封（無ければ null）。
 * createdAt：行（ブレーキ・証拠）を作った日時。封より後に作ったものは対象外。tag：主張の根拠の印（あれば）
 */
export function sealOn(seals: Seal[], column: string, createdAt: string | null | undefined, tag?: string | null): Seal | null {
  const table = column.split(".")[0];
  for (const s of seals) {
    if (!s.columns.includes(column) && !s.columns.includes(`${table}.*`)) continue;
    if (createdAt && new Date(createdAt) > new Date(s.locked_at)) continue;
    if (TAGGED_COLUMNS.has(column) && tag && tag !== "fact") continue; // 仮封
    return s;
  }
  return null;
}

/** ブレーキの答え（④⑥）の封で使う印。承認前のAIの下書きは仮の主張として扱う */
export const sealTag = (b: { because_tag?: string | null; counter_by?: string | null; counter_approved_at?: string | null }) => (b.counter_by === "ai" && !b.counter_approved_at ? "hypothesis" : b.because_tag ?? "hypothesis");
