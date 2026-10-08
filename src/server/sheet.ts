import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { complete, parseJson } from "@/server/ai/client";

export { FACETS, type FacetKey } from "@/lib/facets";
import { FACETS, type FacetKey } from "@/lib/facets";

/** Today's facet by day index within the divergence period and the current round. */
export function facetForToday(rowsByFacet: Record<string, number>, maxRound: number) {
  // pick the thinnest facet; ties → facet order
  let best: (typeof FACETS)[number] = FACETS[0];
  let min = Infinity;
  for (const f of FACETS) {
    const n = rowsByFacet[f.key] ?? 0;
    if (n < min) {
      min = n;
      best = f;
    }
  }
  const round = Math.max(1, maxRound || 1);
  return { facet: best, round };
}

export async function loadFacetPrompt(facet: FacetKey, round: number) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("method_facets")
    .select("prompt_template, helper_examples")
    .eq("facet", facet)
    .eq("round", Math.min(round, 3))
    .maybeSingle();
  return data;
}

type DraftRow = {
  experience?: string; value: string; target?: string; one_liner?: string; source?: string };

/** AI drafts 3–5 candidate rows for a facet from company context + existing rows. */
export async function draftRows(opts: {
  companyName: string;
  summary: unknown;
  facet: FacetKey;
  round: number;
  existing: string[];
}): Promise<DraftRow[]> {
  const f = FACETS.find((x) => x.key === opts.facet)!;
  const tpl = await loadFacetPrompt(opts.facet, opts.round);
  const user = `会社: ${opts.companyName}
御社の説明（承認済みを優先）: ${JSON.stringify(opts.summary ?? {}, null, 0).slice(0, 9000)}

今日の面: ${f.label}（${f.hint}）
周回: ${opts.round}（1=広く / 2=細分化・マイクロニッチ / 3=面の掛け合わせ）
${tpl?.prompt_template ? "問いの指針: " + tpl.prompt_template : ""}

既に出ている提供価値（重複しないこと）:
${opts.existing.map((e, i) => `${i + 1}. ${e}`).join("\n") || "（まだ無い）"}

この面で、まだ出ていない提供価値・体験価値を3〜5組。御社の説明や資料にある事実・言葉を使う。どの会社でも言える一般論（丁寧なヒアリング、迅速な対応、分かりやすい説明 など）は出さない。
value（提供価値）: 主語は自社、「〜できる」で終える。特徴・事実。
experience（体験価値）: 主語はお客様、「〜と感じることができる」で終える。value の「だから」の先。
「御社は value。だから、お客様は experience」と読んで自然であること。根拠がサマリーに無いものは source に "仮説" と書く。
JSONのみで返す: [{"value":"...","experience":"...","target":"誰向けか","one_liner":"中学生に説明する一言","source":"サマリーのどこ / 仮説"}]`;
  const text = await complete({ promptKey: "diverge", user, maxTokens: 1500 });
  return parseJson<DraftRow[]>(text) ?? [];
}

/** 体験価値が空の行に、「だから、お客様は〜と感じることができる」の下書きを付ける */
export async function draftExperiences(opts: { companyName: string; summary: unknown; rows: { id: string; value: string; target: string | null }[] }): Promise<{ id: string; experience: string }[]> {
  if (opts.rows.length === 0) return [];
  const user = `会社: ${opts.companyName}
御社の説明（承認済みを優先）: ${JSON.stringify(opts.summary ?? {}, null, 0).slice(0, 9000)}

次の提供価値（御社は〜できる）それぞれに、体験価値を1つずつ書く。
体験価値: 主語はお客様、「〜と感じることができる」で終える。「御社は〔提供価値〕。だから、お客様は〔体験価値〕」と読んで自然であること。
機能の言い換えではなく、お客様の気持ち・状態の変化を書く。

${opts.rows.map((r) => `- id:${r.id} / ${r.value}${r.target ? "（" + r.target + "向け）" : ""}`).join("\n")}

JSONのみで返す: [{"id":"...","experience":"..."}]`;
  const text = await complete({ promptKey: "diverge", user, maxTokens: 1500 });
  return parseJson<{ id: string; experience: string }[]>(text) ?? [];
}
