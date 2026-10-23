import "server-only";
import { q } from "@/lib/limits";
import { complete, parseJson } from "@/server/ai/client";
import { EVIDENCE_KINDS, KIND_SET } from "@/lib/evidence";

export type ClaimIn = { ref: string; label: string; text: string };
export type RowIn = { id: string; value: string; experience: string | null; claims: ClaimIn[] };
export type EvidenceCandidate = { row_id: string; claim_ref: string | null; what: string; content: string; kind: string; source: string };

/** 比べるために、空白と記号の違いをならす（資料の改行・全角半角の空白・句読点の揺れで一致を見落とさないように） */
const squash = (s: string) => s.normalize("NFKC").replace(/[\s「」『』"'“”‘’、。，．・…]/g, "");

/**
 * STEP 7 のAI：渡した材料（資料・面談記録・適合診断）の中から、各組の「なぜなら」を裏づけそうな箇所を候補として抜き出す。
 * 材料にそのまま書かれている文だけを候補にする。材料と照らして一致しない候補（作文・言い換え）はここで捨てる。
 * 指示文本体は method_prompts.evidence_draft（DB）。
 */
export async function findEvidenceCandidates(opts: { companyName: string; materials: Record<string, string>; rows: RowIn[] }): Promise<EvidenceCandidate[]> {
  if (opts.rows.length === 0) return [];
  const matText = Object.entries(opts.materials).map(([k, v]) => `【${k}】\n${v}`).join("\n\n").slice(0, 24000);
  const user = `会社: ${opts.companyName}

材料（この中に書かれていることだけを使う。出所は【】の見出し名で書く）:
${matText}

証拠の種類（kind）: ${EVIDENCE_KINDS.map((k) => `${k.key}=${k.label}`).join(" / ")}

次の各組について、「裏づけたい主張」を裏づける箇所を材料から探す。1組あたり最大3件。見つからなければその組は出さない。
content は材料の文をそのまま抜き出す（言い換え・要約・付け足しをしない。200字以内）。source は材料の見出し名（必要なら資料名・ページ・発言者）。
claim_ref は裏づける主張の ref をそのまま書く。what は何を裏づけるかを20字以内で。

組:
${opts.rows.map((r) => `- id:${r.id}\n  御社は: ${q(r.value)}${r.experience ? `\n  だから、お客様は: ${q(r.experience)}` : ""}\n  裏づけたい主張:\n${r.claims.map((c) => `    - ref:${c.ref}（${c.label}）: ${q(c.text, 300)}`).join("\n")}`).join("\n")}

JSONのみで返す: [{"row_id":"...","claim_ref":"row","what":"...","content":"...","kind":"own_fact","source":"..."}]`;
  const text = await complete({ promptKey: "evidence_draft", user, maxTokens: 6000 });
  const parsed = parseJson<EvidenceCandidate[]>(text);
  if (!Array.isArray(parsed)) throw new Error("evidence_draft: AIの返答を読み取れませんでした");
  const hay = squash(matText);
  const rowIds = new Map(opts.rows.map((r) => [r.id, new Set(r.claims.map((c) => c.ref))]));
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return parsed
    .filter((d) => d && typeof d === "object" && rowIds.has(String(d.row_id)))
    .map((d) => ({
      row_id: String(d.row_id),
      claim_ref: rowIds.get(String(d.row_id))!.has(String(d.claim_ref)) ? String(d.claim_ref) : null,
      what: str(d.what, 100),
      content: str(d.content, 400),
      kind: KIND_SET.has(String(d.kind)) ? String(d.kind) : "own_fact",
      source: str(d.source, 200),
    }))
    // 材料にそのまま書かれている文だけを残す（12字以上が一致すること。短すぎる断片は証拠にならない）
    .filter((d) => d.content.length >= 12 && hay.includes(squash(d.content)));
}
