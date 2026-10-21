import "server-only";
import { q } from "@/lib/limits";
import { complete, parseJson } from "@/server/ai/client";
import { MARKET_AXES, NICHE_QUESTIONS } from "@/lib/litmus";

export type LitmusIn = { id: string; value: string; experience: string | null; because: string | null };
export type LitmusDraft = { id: string; q1: boolean | null; q2: boolean | null; note: string; marks: Partial<Record<string, number>> };

/**
 * STEP 6 のAI仮判定。組ごとに、ニッチの2問（はい／いいえ／わからない）と、市場フィットの各軸（◎○△× = 3/2/1/0）を出す。
 * これは「たたき台」で、決めるのは御社。材料に無いことは推測で高く付けない。指示文本体は method_prompts.litmus_draft（DB）。
 */
export async function draftLitmus(opts: { companyName: string; profile: Record<string, string>; rows: LitmusIn[] }): Promise<LitmusDraft[]> {
  if (opts.rows.length === 0) return [];
  const user = `会社: ${opts.companyName}
御社の説明・聞き取り・面談記録・競合（材料）:
${Object.entries(opts.profile).map(([k, v]) => `[${k}] ${v}`).join("\n").slice(0, 12000)}

ニッチの2問（true=はい / false=いいえ / null=材料から判断できない）:
${NICHE_QUESTIONS.map((x) => `- ${x.key}: ${x.text}`).join("\n")}

市場フィットの軸（3=◎ / 2=○ / 1=△ / 0=× 。材料から判断できない軸は省略）:
${MARKET_AXES.map((a) => `- ${a.key}（${a.label}）: ${a.hint}`).join("\n")}

次の各組について判定する。note は判定の理由を40字以内で（何が材料にあり、何が分からないか）。

組:
${opts.rows.map((r) => `- id:${r.id}\n  御社は: ${q(r.value)}\n  だから、お客様は: ${q(r.experience) || "（空）"}${r.because ? `\n  なぜなら: ${q(r.because)}` : ""}`).join("\n")}

JSONのみで返す: [{"id":"...","q1":true,"q2":null,"note":"...","marks":{"investment":2,"feasibility":3}}]`;
  const text = await complete({ promptKey: "litmus_draft", user, maxTokens: 6000 });
  const parsed = parseJson<LitmusDraft[]>(text);
  if (!Array.isArray(parsed)) throw new Error("litmus_draft: AIの返答を読み取れませんでした");
  const keys = new Set<string>(MARKET_AXES.map((a) => a.key));
  const tri = (v: unknown) => (v === true ? true : v === false ? false : null);
  return parsed
    .filter((d) => d && typeof d.id === "string")
    .map((d) => {
      const marks: Record<string, number> = {};
      for (const [k, v] of Object.entries(d.marks ?? {})) {
        const n = Number(v);
        if (keys.has(k) && [0, 1, 2, 3].includes(n)) marks[k] = n;
      }
      return { id: d.id, q1: tri(d.q1), q2: tri(d.q2), note: String(d.note ?? "").slice(0, 200), marks };
    });
}
