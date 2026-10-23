import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { complete, parseJson, loadFixedText } from "@/server/ai/client";
import { extractCompanyDocs } from "@/server/extract";
import { PROFILE_ITEMS } from "@/lib/profileItems";
import { loadIntakeContext, targetRule } from "@/server/intake";
import { loadMeetingContext } from "@/server/meetingRecords";

/** AIの返答がJSONの配列として読めなければ失敗にする（途中で切れた返答を「0件成功」にしない） */
function arrayOrThrow<T>(v: T[] | null | undefined, name: string): T[] {
  if (!Array.isArray(v)) throw new Error(`${name}: AIの返答を読み取れませんでした`);
  return v;
}

type DraftItem = { key: string; draft: string; tag: "fact" | "verify" | "hypothesis"; source: string };

/** B の問いの文面（メソッド資産。DBから） */
export async function loadBQuestions() {
  const entries = await Promise.all(PROFILE_ITEMS.filter((i) => i.group === "B").map(async (i) => [i.key, await loadFixedText(`step0_${i.key}`)] as const));
  return Object.fromEntries(entries) as Record<string, string>;
}

/** 資料から「御社の説明」の下書きを作る */
export async function draftProfile(companyId: string, companyName: string): Promise<{ items: DraftItem[]; skipped: string[]; errors: string[]; docCount: number }> {
  const [{ docs, skipped, errors }, intake, meetings] = await Promise.all([extractCompanyDocs(companyId), loadIntakeContext(companyId, companyName), loadMeetingContext(companyId).catch(() => "")]);
  // 適合診断の聞き取りも資料の一つとして渡す。書き起こしの枠を先に取り、残りを会社資料で埋める（合計12万字）
  const head: { title: string; kind: string; text: string }[] = [];
  if (intake.notes) head.push({ title: "適合診断の面談記録（ベレネッツが聞き取った要点）", kind: "diagnosis_memo", text: intake.notes });
  if (intake.transcript) head.push({ title: "適合診断の書き起こし（ベレネッツとお客様の両方が話している。お客様の発言だけを材料にする）", kind: "diagnosis_memo", text: intake.transcript });
  if (intake.memos) head.push({ title: "適合診断の面談メモ・資料（ベレネッツがヒアリング中に取ったメモと受け取った資料。お客様の発言・事実だけを材料にする）", kind: "diagnosis_memo", text: intake.memos });
  if (meetings) head.unshift({ title: "面談の記録（キックオフ・確認セッションなど。新しい順。お客様の発言・事実だけを材料にする。適合診断より新しい情報として優先）", kind: "meeting_record", text: meetings });
  const all = [...head, ...docs];
  if (all.length === 0) return { items: [], skipped, errors, docCount: 0 };
  const bq = await loadBQuestions();
  const corpus = all.map((d, i) => `### 資料${i + 1}: ${d.title}（${d.kind}）\n${d.text}`).join("\n\n").slice(0, 120_000);
  const itemList = PROFILE_ITEMS.filter((i) => !i.fixed)
    .map((i) => `- ${i.key} [${i.group}] ${i.label}${i.hint ? "（" + i.hint + "）" : ""}${i.group === "B" && bq[i.key] ? "：問い「" + bq[i.key] + "」" : ""}`)
    .join("\n");
  const user = `会社: ${companyName}
${targetRule(intake.target)}

次の項目について、資料から下書きを書く。「適合診断の面談記録」「書き起こし」は資料と同じ重さで使い、お客様が話した言葉を生かす。書き起こしのうち、ベレネッツ側の質問・説明は材料にしない。
A の項目は資料に書いてあることだけを、資料の言葉を生かして2〜4文で。書いていなければ draft は空文字。
B の項目は「御社に答えてもらう問い」。資料から読み取れる範囲で仮説を1〜2文、必ず tag は "hypothesis"。読み取れなければ空文字。
tag: 資料に明記＝"fact"／資料にあるが確認が要る（古い・曖昧）＝"verify"／推測＝"hypothesis"。
source: どの資料のどこか（資料番号とページや見出し）。空の項目は source も空。

項目:
${itemList}

資料:
${corpus}

JSONのみで返す: [{"key":"a1","draft":"...","tag":"fact","source":"資料1 会社概要"}, ...]`;
  const text = await complete({ promptKey: "step0_summary", user, maxTokens: 3000 });
  const items = arrayOrThrow(parseJson<DraftItem[]>(text), "profile_draft").filter((x) => x && typeof x.key === "string" && PROFILE_ITEMS.some((i) => i.key === x.key && !i.fixed));
  return { items, skipped, errors, docCount: docs.length };
}

/**
 * AI下書き用の会社コンテキスト。
 * 「御社の説明」（承認・直した項目を優先、無ければAI下書き）＋ B の回答 ＋ 資料テキストの冒頭。
 */
export async function loadProfileContext(supabase: { from: SupabaseClient["from"] }, companyId: string): Promise<Record<string, string>> {
  const [{ data: items }, { data: docs }, { data: sum }] = await Promise.all([
    supabase.from("profile_items").select("key, draft, value, status").eq("company_id", companyId),
    supabase.from("company_documents").select("title, text_content").eq("company_id", companyId).not("text_content", "is", null).order("created_at").limit(5),
    supabase.from("company_profile_summary").select("q1_before").eq("company_id", companyId).maybeSingle(),
  ]);
  const ctx: Record<string, string> = {};
  const { data: cname } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  const intake = await loadIntakeContext(companyId, cname?.name ?? "", 6000).catch(() => ({ target: "", notes: "", transcript: "", memos: "" }));
  if (intake.target) ctx["対象（これ以外の事業・親会社の話は含めない）"] = intake.target;
  if (sum?.q1_before) ctx["一言で言うと"] = sum.q1_before;
  for (const it of items ?? []) {
    const def = PROFILE_ITEMS.find((d) => d.key === it.key);
    if (!def) continue;
    const text = ["approved", "fixed"].includes(it.status) ? it.value : it.status === "draft" ? it.draft : null;
    if (text) ctx[def.label + (it.status === "draft" ? "（AI下書き・未承認）" : "")] = text;
  }
  const docText = (docs ?? []).map((d) => `[${d.title}] ${(d.text_content ?? "").slice(0, 1500)}`).join("\n");
  if (docText) ctx["資料の抜粋"] = docText.slice(0, 6000);
  if (intake.notes) ctx["適合診断の面談記録（ベレネッツが聞き取った要点）"] = intake.notes.slice(0, 4000);
  if (intake.transcript) ctx["適合診断の書き起こし（抜粋。お客様の発言だけを材料にする）"] = intake.transcript;
  if (intake.memos) ctx["適合診断の面談メモ・資料（抜粋。お客様の発言・事実だけを材料にする）"] = intake.memos;
  const { data: comps } = await supabase.from("competitors").select("name, product, website, is_reference").eq("company_id", companyId);
  if (comps?.length) ctx["競合（お客様が登録。比べられる相手。参考＝こうなりたい会社）"] = comps.map((c) => `${c.is_reference ? "参考：" : "競合："}${c.name}${c.product ? "／" + c.product : ""}${c.website ? "（" + c.website + "）" : ""}`).join("\n");
  const meetings = await loadMeetingContext(companyId, 8000).catch(() => "");
  if (meetings) ctx["面談の記録（キックオフ・確認セッションなど。新しい順。適合診断より新しい情報として優先）"] = meetings;
  return ctx;
}
