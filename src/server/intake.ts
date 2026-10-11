import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";


export const TARGET_KIND_LABEL: Record<string, string> = { company: "会社全体", brand: "事業部・ブランド", product: "商品・サービス" };
export const VERDICT_LABEL: Record<string, string> = { fit: "適合", unfit: "不適合", hold: "保留" };
export const Q_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"] as const;

export type Intake = {
  company_id: string;
  target_kind: string;
  target_name: string | null;
  target_note: string | null;
  answers: Record<string, string>;
  transcript: string | null;
  transcript_name: string | null;
  verdict: string | null;
  verdict_note: string | null;
  held_on: string | null;
  updated_at: string;
};

/** 適合診断の固定文（メソッド資産。DB の method_fixed_texts: diag_intro / diag_q1 … diag_q7 / diag_guide）を1回で読む */
export async function loadDiagTexts(): Promise<Record<string, string>> {
  const keys = ["diag_intro", "diag_guide", ...Q_KEYS.map((k) => `diag_${k}`)];
  const { data } = await createAdminClient().from("method_fixed_texts").select("key, body").in("key", keys);
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.body ?? ""]));
}
/** 7問の文面（q1 … q7 のキーで） */
export async function loadDiagQuestions(): Promise<Record<string, string>> {
  const t = await loadDiagTexts();
  return Object.fromEntries(Q_KEYS.map((k) => [k, t[`diag_${k}`] ?? ""]));
}

const INTAKE_COLS = "company_id, target_kind, target_name, target_note, answers, transcript_name, verdict, verdict_note, held_on, updated_at";

/** 記録を読む（書き起こし本文は withTranscript のときだけ）。表が無い（SQL未実行）ときは missing: true */
export async function loadIntake(companyId: string, withTranscript = false): Promise<Intake | null> {
  const { data } = await createAdminClient().from("diagnosis_intakes").select(withTranscript ? INTAKE_COLS + ", transcript" : INTAKE_COLS).eq("company_id", companyId).maybeSingle();
  if (!data) return null;
  const row = data as unknown as Partial<Intake>;
  return { ...row, transcript: row.transcript ?? null } as Intake;
}

/** 「対象」の一文（AIにも管理画面にも使う）。未設定なら空 */
export function describeTarget(i: Intake | null, companyName: string): string {
  if (!i || (!i.target_name && i.target_kind === "company" && !i.target_note)) return "";
  const kind = TARGET_KIND_LABEL[i.target_kind] ?? i.target_kind;
  // 事業部・商品なのに名前が無いときは、会社全体と取り違えないよう「（名前未記入）」と書く
  const name = i.target_name || (i.target_kind === "company" ? companyName : `${companyName}の一部（名前未記入）`);
  return `${name}（${kind}）${i.target_note ? "。" + i.target_note : ""}`;
}

/** 書き起こしから、ベレネッツ側が読み上げた固定文（冒頭の説明・7問）を取り除く。お客様の発言だけを材料にするため */
function stripOperatorScript(transcript: string, texts: Record<string, string>): string {
  let out = transcript;
  const phrases = [texts.diag_intro ?? "", ...Q_KEYS.map((k) => texts[`diag_${k}`] ?? "")]
    .flatMap((t) => t.split(/[。？?\n]/))
    .map((p) => p.trim())
    .filter((p) => p.length >= 12);
  for (const p of phrases) out = out.split(p).join("");
  return out;
}

/**
 * AI下書きに渡す「適合診断の聞き取り」。
 * 対象の範囲を先に言い、面談の記録（7問の答え・追加で聞いたお客様の発言）と、書き起こしを付ける。
 * 判定メモと「ベレネッツの気づき」は渡さない。書き起こしからはベレネッツが読み上げた固定文を除く。
 */
export async function loadIntakeContext(companyId: string, companyName: string, maxTranscript = 40_000): Promise<{ target: string; notes: string; transcript: string }> {
  const [i, texts] = await Promise.all([loadIntake(companyId, true), loadDiagTexts()]);
  if (!i) return { target: "", notes: "", transcript: "" };
  const target = describeTarget(i, companyName);
  const lines: string[] = [];
  if (i.held_on) lines.push(`診断日：${i.held_on}${i.answers?.attendees ? "／面談した相手：" + i.answers.attendees : ""}`);
  for (const k of Q_KEYS) {
    const a = (i.answers?.[k] ?? "").trim();
    if (a) lines.push(`${texts[`diag_${k}`] ? "問：" + texts[`diag_${k}`] + "\n" : ""}答：${a}`);
  }
  if ((i.answers?.extra ?? "").trim()) lines.push(`追加で聞いたこと（お客様の発言）：${i.answers.extra.trim()}`);
  const t = stripOperatorScript((i.transcript ?? "").trim(), texts);
  return { target, notes: lines.join("\n\n"), transcript: t.slice(0, maxTranscript) };
}

/** 対象の範囲をAIに守らせる一文 */
export function targetRule(target: string): string {
  if (!target) return "";
  return `対象: ${target}\n資料や発言に、対象以外（親会社・グループ会社・他の事業）の話が混ざっていても、対象のことだけを書く。対象以外の実績・数字を対象のものとして書かない。`;
}

/**
 * 契約前（diagnosed）の会社に担当者を登録・招待してよいか。
 * 適合診断の記録で判定が「適合」になるまでは、顧客のメールアドレスを入れない運用。契約後の会社は常に可。
 */
export async function inviteGate(companyId: string, status: string): Promise<{ ok: boolean; reason: string }> {
  if (status !== "diagnosed") return { ok: true, reason: "" };
  const { data, error } = await createAdminClient().from("diagnosis_intakes").select("verdict").eq("company_id", companyId).maybeSingle();
  if (error) return { ok: false, reason: "適合診断の記録を読めませんでした（SQL 0021 が未実行の可能性があります）" };
  if (!data) return { ok: false, reason: "適合診断の記録がまだありません。「適合診断の記録」で判定を「適合」にすると、お客様のメールアドレスを登録できます" };
  if (data.verdict !== "fit") return { ok: false, reason: `判定が「${VERDICT_LABEL[data.verdict ?? ""] ?? "未判定"}」のため、お客様の登録・招待はまだできません。「適合診断の記録」で判定を「適合」にすると登録できます` };
  return { ok: true, reason: "" };
}
