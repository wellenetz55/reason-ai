import "server-only";
import { complete, parseJson } from "@/server/ai/client";
import { BRAKE_KINDS, BRAKE_SOURCES } from "@/lib/brakes";

type RowIn = { id: string; value: string; experience: string | null };
export type BrakeDraft = { id: string; kind: string; words: string; source: string; tag: "fact" | "verify" | "hypothesis" };

const KINDS = new Set<string>(BRAKE_KINDS.map((k) => k.key));
const SOURCES = new Set<string>(BRAKE_SOURCES.map((s) => s.key));
const TAGS = new Set(["fact", "verify", "hypothesis"]);

/**
 * STEP 3「お客様のブレーキ」の下書き。組ごとに 不信／不要／不適／不急 を買い手の言葉で出す。
 * 材料は御社の説明（STEP 0）・適合診断の聞き取り・面談記録・資料。根拠が無いものは必ず hypothesis。
 * 指示文本体は method_prompts.brakes_draft（DB）。
 */
export async function draftBrakes(opts: { companyName: string; profile: Record<string, string>; rows: RowIn[] }): Promise<BrakeDraft[]> {
  if (opts.rows.length === 0) return [];
  const user = `会社: ${opts.companyName}
御社の説明・聞き取り・面談記録（材料）:
${Object.entries(opts.profile).map(([k, v]) => `[${k}] ${v}`).join("\n").slice(0, 12000)}

ブレーキの種類（kind）:
${BRAKE_KINDS.map((k) => `- ${k.key}（${k.label}）: ${k.ask}`).join("\n")}

出所（source）: ${BRAKE_SOURCES.map((s) => `${s.key}=${s.label}`).join(" / ")}
根拠タグ（tag）: fact=材料に実際の言葉や事実がある / verify=材料にあるが確認が要る / hypothesis=材料に無く推測

次の各組について、お客様（買い手）が御社を選ぶのをためらう「心の声」を、4種類それぞれ1つずつ書く。
- words は買い手の一人称の言葉（「〜なのでは」「〜だろう」）。御社の言い分ではない。1〜2文。
- 材料にある言葉・不満・断り文句があれば、それを優先して使い、source をその出所にする。
- 材料に無いものは source=ai, tag=hypothesis にする。推測を事実のように書かない。
- その組に当てはまらない種類は無理に作らず省略してよい。

組:
${opts.rows.map((r) => `- id:${r.id}\n  御社は: ${r.value}\n  だから、お客様は: ${r.experience ?? "（空）"}`).join("\n")}

JSONのみで返す: [{"id":"...","kind":"distrust","words":"...","source":"meeting","tag":"verify"}]`;
  const text = await complete({ promptKey: "brakes_draft", user, maxTokens: 8000 });
  const parsed = parseJson<BrakeDraft[]>(text);
  // 読めない（途中で切れた等）ときは失敗として扱う。空のまま成功にすると、同じ組を何度も頼み続けてしまう
  if (!Array.isArray(parsed)) throw new Error("brakes_draft: AIの返答を読み取れませんでした");
  return parsed
    .filter((d) => d && typeof d.id === "string" && KINDS.has(d.kind) && typeof d.words === "string" && d.words.trim())
    .map((d) => ({ ...d, words: d.words.trim().slice(0, 400), source: SOURCES.has(d.source) ? d.source : "ai", tag: TAGS.has(d.tag) ? d.tag : "hypothesis" }))
    .map((d) => (d.source === "ai" ? { ...d, tag: "hypothesis" as const } : d));
}
