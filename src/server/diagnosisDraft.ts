import "server-only";
import { complete, parseJson } from "@/server/ai/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadIntakeContext, loadDiagTexts, targetRule } from "@/server/intake";
import { extractCompanyDocs } from "@/server/extract";
import { FIT_CONDITIONS, BRAKE_LABEL } from "@/lib/diagnosis";

type Draft = {
  verdict: "fit" | "hold" | "unfit";
  verdict_reason: string;
  one_liner_before?: string;
  seeds?: { feature: string; experience: string; tag: "fact" | "verify" | "hypothesis" }[];
  brakes?: { kind: string; words: string }[];
  fit_reasons?: { condition_no: number; quote: string }[];
};

const VERDICT_JA: Record<string, string> = { fit: "適合", hold: "保留", unfit: "不適合" };

/**
 * 「適合診断を始める」：面談の記録（7問の答え・書き起こし・面談メモ・資料）から、
 * 判定の案と理由、お客様に見せる結果の下書きを作る。
 * - 判定案と理由は、記録の「判定（ベレネッツ用メモ）」に AI案として書く（判定そのものは変えない。決めるのはベレネッツ）
 * - 結果の下書きは「適合診断の結果を書く」の空いている欄にだけ入れる（書いてある欄は上書きしない。公開済みなら触らない）
 */
export async function startDiagnosis(companyId: string): Promise<{ verdict: string; filled: string[]; note: string }> {
  const admin = createAdminClient();
  const [{ data: c }, texts] = await Promise.all([admin.from("companies").select("name").eq("id", companyId).single(), loadDiagTexts()]);
  const name = c?.name ?? "";
  const [intake, docsRes] = await Promise.all([loadIntakeContext(companyId, name, 30_000), extractCompanyDocs(companyId).catch(() => ({ docs: [], skipped: [], errors: [] }))]);
  if (!intake.notes && !intake.transcript && !intake.memos) throw new Error("面談の記録がまだありません。7問の答え、書き起こし、面談メモのどれかを入れてから始めてください");

  const docText = docsRes.docs.map((d) => `[${d.title}] ${d.text.slice(0, 2000)}`).join("\n").slice(0, 8000);
  const user = `会社: ${name}
${targetRule(intake.target)}

あなたは、ベレネッツの45分の適合診断のあとに、判定の案と、お客様に見せる結果の下書きを作る。
判定は「適合」「保留」「不適合」のどれか。判定の手引きは次のとおり。
---
${texts.diag_guide ?? "（手引きは未登録）"}
---

材料（お客様が話したこと・事実だけを使う。ベレネッツ側の発言は材料にしない）:
${intake.notes ? "■ 面談の記録（7問の答え・追加で聞いたこと）\n" + intake.notes + "\n\n" : ""}${intake.transcript ? "■ 書き起こし（抜粋）\n" + intake.transcript + "\n\n" : ""}${intake.memos ? "■ 面談メモ・資料\n" + intake.memos + "\n\n" : ""}${docText ? "■ 会社資料・Webの抜粋\n" + docText + "\n\n" : ""}
適合の条件（fit_reasons の condition_no はこの番号）:
${FIT_CONDITIONS.map((f, i) => `${i + 1}. ${f}`).join("\n")}

ブレーキの種類（brakes の kind）: ${Object.entries(BRAKE_LABEL).map(([k, v]) => `${k}=${v}`).join(" / ")}

書き方:
- verdict_reason: 素材（選ばれている事実があるか）・言語化（差が言葉になっていないか）・姿勢（経営者が決める意思、時間、一緒に考える人）のそれぞれについて1〜2文。根拠になった発言を短く引用する。保留なら、時期を改める理由と、何が分かれば判断できるかを書く
- one_liner_before: お客様が面談で自社を一言で言った言葉（聞いたまま。無ければ省略）
- seeds: 「選ばれる理由の芽」最大3つ。feature は「御社は〜できる」の「〜できる」の部分だけ。experience は「だから、お客様は〜と感じられる」の「〜と感じられる」の部分だけ。tag は発言や資料に根拠があれば fact、要確認なら verify、推測なら hypothesis
- brakes: お客様が口にした、まだ言葉になっていない不安（最大2つ）。words はお客様の言葉のまま。無ければ空配列
- fit_reasons: 判定が適合または保留のとき、当てはまる条件（最大3つ）と、根拠になった発言の引用。quote は「……」とおっしゃった、の形
- どの会社でも言える言葉で埋めない。根拠の無い数字・固有名詞を作らない。材料に無いことは書かない。空欄でよい

JSONのみで返す:
{"verdict":"fit|hold|unfit","verdict_reason":"...","one_liner_before":"...","seeds":[{"feature":"...","experience":"...","tag":"fact|verify|hypothesis"}],"brakes":[{"kind":"distrust","words":"..."}],"fit_reasons":[{"condition_no":1,"quote":"..."}]}`;

  const text = await complete({ promptKey: "diag_draft", user, maxTokens: 3000 });
  const d = parseJson<Draft>(text);
  if (!d || !["fit", "hold", "unfit"].includes(d.verdict)) throw new Error("AIの答えを読み取れませんでした。もう一度お試しください");

  // 1) 判定案 → 記録の判定メモ（AI案として。判定そのものは変えない）
  const { data: cur } = await admin.from("diagnosis_intakes").select("verdict_note").eq("company_id", companyId).maybeSingle();
  const prev = (cur?.verdict_note ?? "").replace(/^【AI判定案[^】]*】[\s\S]*?(?=\n\n(?!【AI)|$)/m, "").trim();
  const aiNote = `【AI判定案：${VERDICT_JA[d.verdict]}】${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}\n${(d.verdict_reason ?? "").trim()}`;
  await admin.from("diagnosis_intakes").update({ verdict_note: prev ? `${aiNote}\n\n${prev}` : aiNote, updated_at: new Date().toISOString() }).eq("company_id", companyId);

  // 2) 結果の下書き → 空いている欄にだけ
  const filled: string[] = [];
  const { data: r } = await admin.from("diagnosis_results").select("published_at, one_liner_before, seeds, brakes, fit_reasons").eq("company_id", companyId).maybeSingle();
  if (r?.published_at) return { verdict: VERDICT_JA[d.verdict], filled, note: "結果は公開済みのため、下書きは入れていません（判定案だけ記録に書きました）" };
  const patch: Record<string, unknown> = { company_id: companyId, updated_at: new Date().toISOString() };
  const clean = (v: unknown) => String(v ?? "").trim();
  if (!r?.one_liner_before && clean(d.one_liner_before)) { patch.one_liner_before = clean(d.one_liner_before).slice(0, 200); filled.push("御社を一言で"); }
  const seeds = (d.seeds ?? []).map((x) => ({ feature: clean(x.feature).slice(0, 200), experience: clean(x.experience).slice(0, 200), tag: ["fact", "verify", "hypothesis"].includes(x.tag) ? x.tag : "hypothesis" })).filter((x) => x.feature).slice(0, 3);
  if (!(Array.isArray(r?.seeds) && r.seeds.length) && seeds.length) { patch.seeds = seeds; filled.push(`選ばれる理由の芽 ${seeds.length}`); }
  const brakes = (d.brakes ?? []).map((x) => ({ kind: BRAKE_LABEL[x.kind] ? x.kind : "distrust", words: clean(x.words).slice(0, 200) })).filter((x) => x.words).slice(0, 2);
  if (!(Array.isArray(r?.brakes) && r.brakes.length) && brakes.length) { patch.brakes = brakes; filled.push(`ブレーキ ${brakes.length}`); }
  const fit = (d.fit_reasons ?? []).map((x) => ({ condition: FIT_CONDITIONS[Number(x.condition_no) - 1] ?? "", quote: clean(x.quote).slice(0, 300) })).filter((x) => x.condition).slice(0, 3);
  if (!(Array.isArray(r?.fit_reasons) && r.fit_reasons.length) && fit.length && d.verdict !== "unfit") { patch.fit_reasons = fit; filled.push(`適合の理由 ${fit.length}`); }
  if (filled.length) {
    const { error } = await admin.from("diagnosis_results").upsert(patch, { onConflict: "company_id" });
    if (error) throw new Error("下書きを保存できませんでした：" + error.message);
  }
  return { verdict: VERDICT_JA[d.verdict], filled, note: "" };
}
