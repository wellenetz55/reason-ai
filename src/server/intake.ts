import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFixedText } from "@/server/ai/client";

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

/** 7問の文面（メソッド資産。DB の method_fixed_texts: diag_q1 … diag_q7） */
export async function loadDiagQuestions(): Promise<Record<string, string>> {
  const entries = await Promise.all(Q_KEYS.map(async (k) => [k, await loadFixedText(`diag_${k}`)] as const));
  return Object.fromEntries(entries);
}

export async function loadIntake(companyId: string): Promise<Intake | null> {
  const { data } = await createAdminClient().from("diagnosis_intakes").select("*").eq("company_id", companyId).maybeSingle();
  return (data as Intake | null) ?? null;
}

/** 「対象」の一文（AIにも管理画面にも使う）。未設定なら空 */
export function describeTarget(i: Intake | null, companyName: string): string {
  if (!i || (!i.target_name && i.target_kind === "company" && !i.target_note)) return "";
  const kind = TARGET_KIND_LABEL[i.target_kind] ?? i.target_kind;
  const name = i.target_name || companyName;
  return `${name}（${kind}）${i.target_note ? "。" + i.target_note : ""}`;
}

/**
 * AI下書きに渡す「適合診断の聞き取り」。
 * 対象の範囲を先に言い、7問の答え（面談で聞いたまま）と、書き起こしの抜粋を付ける。判定メモは渡さない。
 */
export async function loadIntakeContext(companyId: string, companyName: string, maxTranscript = 40_000): Promise<{ target: string; notes: string; transcript: string }> {
  const i = await loadIntake(companyId);
  if (!i) return { target: "", notes: "", transcript: "" };
  const target = describeTarget(i, companyName);
  const q = await loadDiagQuestions();
  const lines: string[] = [];
  for (const k of Q_KEYS) {
    const a = (i.answers?.[k] ?? "").trim();
    if (a) lines.push(`${q[k] ? "問：" + q[k] + "\n" : ""}答：${a}`);
  }
  if ((i.answers?.extra ?? "").trim()) lines.push(`追加で聞いたこと：${i.answers.extra.trim()}`);
  return {
    target,
    notes: lines.join("\n\n"),
    transcript: (i.transcript ?? "").trim().slice(0, maxTranscript),
  };
}

/** 対象の範囲をAIに守らせる一文 */
export function targetRule(target: string): string {
  if (!target) return "";
  return `対象: ${target}\n資料や発言に、対象以外（親会社・グループ会社・他の事業）の話が混ざっていても、対象のことだけを書く。対象以外の実績・数字を対象のものとして書かない。`;
}
