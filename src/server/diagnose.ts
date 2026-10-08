import "server-only";
import { complete, parseJson } from "@/server/ai/client";

export type RowForCheck = { id: string; value: string; experience: string | null; target: string | null };
export type Diagnosis = { id: string; vague_score: number; issues: string[]; suggestion_value?: string; suggestion_experience?: string };

/** 提供価値・体験価値の「ふわっと度」を点検し、言い直し案を出す（1回に最大30組） */
export async function diagnoseRows(opts: { companyName: string; summary: unknown; rows: RowForCheck[] }): Promise<Diagnosis[]> {
  if (opts.rows.length === 0) return [];
  const user = `会社: ${opts.companyName}
御社の説明（承認済みを優先）: ${JSON.stringify(opts.summary ?? {}, null, 0).slice(0, 7000)}

次の提供価値・体験価値の組を点検する。
観点:
1. どの会社でも言える語だけで出来ていないか（高品質・安心・丁寧・寄り添う など）
2. 数字・固有名詞・比較対象・条件のどれかがあるか（「24時間以内」「○○資格者が」「他社比」「○○の場合でも」）
3. 提供価値が「〜できる」で終わり、主語が御社になっているか
4. 体験価値が機能の言い換えではなく、お客様の気持ち・状態の変化になっているか
5. 「御社は〔提供価値〕。だから、お客様は〔体験価値〕」と読んで飛躍が無いか

vague_score: 0=具体的 / 1=少しふわっと / 2=ふわっと / 3=どの会社でも言える
issues: 問題点を短い日本語で（最大3つ、無ければ空配列）
suggestion_value / suggestion_experience: vague_score が 1 以上のときだけ、言い直し案。サマリーに根拠が無い数字は書かず【要：実数】と置く。根拠が無い固有名詞は作らない。0 のときは省略。

組:
${opts.rows.map((r) => `- id:${r.id}\n  提供価値: ${r.value}\n  体験価値: ${r.experience ?? "（空）"}${r.target ? "\n  誰向け: " + r.target : ""}`).join("\n")}

JSONのみで返す: [{"id":"...","vague_score":2,"issues":["数字が無い"],"suggestion_value":"...","suggestion_experience":"..."}]`;
  const text = await complete({ promptKey: "vague_check", user, maxTokens: 6000 });
  return (parseJson<Diagnosis[]>(text) ?? []).filter((d) => d && typeof d.id === "string");
}
