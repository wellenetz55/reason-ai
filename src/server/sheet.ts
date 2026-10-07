import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { complete, parseJson } from "@/server/ai/client";

export const FACETS = [
  { key: "functional", label: "機能的側面", hint: "何ができるか。数字・設備・仕組み・対応範囲。" },
  { key: "emotional", label: "情緒的側面", hint: "お客様がどう感じるか。安心・誇り・解放・所属。" },
  { key: "by_target", label: "ターゲット別", hint: "相手が変わると価値が変わる。担当者・経営者・利用者。" },
  { key: "by_trigger", label: "気持ちの入口", hint: "願望・恐れ・イライラから探す。" },
  { key: "competitor_gap", label: "競合の裏返し", hint: "向こうが言っていないこと・できていないこと。" },
  { key: "voice", label: "顧客と社員の声", hint: "レビュー、問い合わせ、クレーム、社員が良いと言うこと。" },
  { key: "history", label: "創業の経緯", hint: "なぜ始めたか、何を捨ててきたか。" },
] as const;

export type FacetKey = (typeof FACETS)[number]["key"];

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

type DraftRow = { value: string; target?: string; one_liner?: string; source?: string };

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
自社理解サマリー(承認済): ${JSON.stringify(opts.summary ?? {}, null, 0).slice(0, 6000)}

今日の面: ${f.label}（${f.hint}）
周回: ${opts.round}（1=広く / 2=細分化・マイクロニッチ / 3=面の掛け合わせ）
${tpl?.prompt_template ? "問いの指針: " + tpl.prompt_template : ""}

既に出ている提供価値（重複しないこと）:
${opts.existing.map((e, i) => `${i + 1}. ${e}`).join("\n") || "（まだ無い）"}

この面で、まだ出ていない提供価値を3〜5行。主語は自社、「〜できる」で終える。根拠がサマリーに無いものは source に "仮説" と書く。
JSONのみで返す: [{"value":"...","target":"誰向けか","one_liner":"中学生に説明する一言","source":"サマリーのどこ / 仮説"}]`;
  const text = await complete({ promptKey: "diverge", user, maxTokens: 1500 });
  return parseJson<DraftRow[]>(text) ?? [];
}
