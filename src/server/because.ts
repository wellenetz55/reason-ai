import "server-only";
import { complete, parseJson } from "@/server/ai/client";
import { createAdminClient } from "@/lib/supabase/admin";

type RowIn = { id: string; value: string; experience: string | null };
export type BecauseDraft = { id: string; experience?: string; because: string; type: "systematic" | "perceived" | "created"; tag: "fact" | "verify" | "hypothesis"; only_us: boolean };

/** 「なぜなら」の下書き。御社の説明（STEP 0 承認分）から根拠を拾う。無い数字は【要：実数】 */
export async function draftBecause(opts: { companyName: string; profile: Record<string, string>; rows: RowIn[] }): Promise<BecauseDraft[]> {
  if (opts.rows.length === 0) return [];
  const admin = createAdminClient();
  const { data: tech } = await admin.from("method_techniques").select("name, usage").eq("kind", "because").order("id");
  const techniques = (tech ?? []).map((t) => `- ${t.name}: ${t.usage ?? ""}`).join("\n");
  const user = `会社: ${opts.companyName}
御社の説明（承認済み）:
${Object.entries(opts.profile).map(([k, v]) => `[${k}] ${v}`).join("\n").slice(0, 8000)}

${techniques ? "根拠の作り方（参考）:\n" + techniques + "\n" : ""}
次の各組について、「なぜなら、〜だから」を書く。
- because は「御社がどうやってその成果をもたらすか」を示す根拠（プロセス・手順・素材・数字・資格・体制・保証）。約束の言い換え（「お客様を大切にするから」）は根拠ではない。
- 御社の説明にある事実だけを使う。無い数字は【要：実数】。無い固有名詞は作らない。
- type: systematic（体系的）/ perceived（知覚される）/ created（生み出された）
- tag: 御社の説明に明記＝fact／あるが確認が要る＝verify／推測＝hypothesis
- only_us: 「〜するのは当社しかありません」と言えそうなら true
- experience: 体験価値が機能の言い換えになっていれば、お客様の気持ちの変化に言い直す。問題なければ省略。

組:
${opts.rows.map((r) => `- id:${r.id}\n  御社は: ${r.value}\n  だから、お客様は: ${r.experience ?? "（空）"}`).join("\n")}

JSONのみで返す: [{"id":"...","because":"...","type":"perceived","tag":"fact","only_us":false,"experience":"..."}]`;
  const text = await complete({ promptKey: "because_draft", user, maxTokens: 5000 });
  return (parseJson<BecauseDraft[]>(text) ?? []).filter((d) => d && typeof d.id === "string" && d.because);
}
