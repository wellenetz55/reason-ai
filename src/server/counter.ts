import "server-only";
import { complete, parseJson } from "@/server/ai/client";
import { BRAKE_KINDS } from "@/lib/brakes";

export type CounterIn = { id: string; kind: string; words: string; value: string; experience: string | null; avoid: string[] };
export type CounterDraft = { id: string; counter: string; because: string; tag: "fact" | "verify" | "hypothesis" };
const TAGS = new Set(["fact", "verify", "hypothesis"]);

/**
 * STEP 4「ブレーキを外す」の下書き。ブレーキ（お客様の心の声）1枚ごとに、⑤先回りの答え と ⑥なぜなら を書く。
 * 分からない数字・固有名詞は「○」の穴のまま残す。指示文本体は method_prompts.counter_draft（DB）。
 */
export async function draftCounters(opts: { companyName: string; profile: Record<string, string>; items: CounterIn[] }): Promise<CounterDraft[]> {
  if (opts.items.length === 0) return [];
  const label = (k: string) => BRAKE_KINDS.find((x) => x.key === k)?.label ?? k;
  const user = `会社: ${opts.companyName}
御社の説明・聞き取り・面談記録（材料）:
${Object.entries(opts.profile).map(([k, v]) => `[${k}] ${v}`).join("\n").slice(0, 12000)}

次の各ブレーキ（お客様の心の声）に、⑤先回りの答え と ⑥なぜなら を書く。
- counter: お客様の言葉に、御社の言葉で先回りして答える一文〜二文。反論・説得ではなく「それなら安心だ」と思える答え。数字・条件・固有名詞を入れる。
- 材料に無い数字・件数・固有名詞は作らず「○」で穴にする（例：「○店で○台の導入実績」）。
- because: その答えが本当だと言える根拠（手順・体制・数字・資格・保証・実績）。材料にある事実だけ。無ければ穴（○）を残す。
- tag: 根拠が材料に明記＝fact／あるが数字・条件の確認が要る＝verify／材料に無い＝hypothesis
- avoid に挙げた案と同じ答えは出さない。

ブレーキ:
${opts.items.map((b) => `- id:${b.id}\n  種類: ${label(b.kind)}\n  お客様の心の声: 「${b.words}」\n  対応する組: 御社は ${b.value}${b.experience ? ` ／ だから、お客様は ${b.experience}` : ""}${b.avoid.length ? `\n  avoid: ${b.avoid.map((a) => `「${a}」`).join(" ")}` : ""}`).join("\n")}

JSONのみで返す: [{"id":"...","counter":"...","because":"...","tag":"verify"}]`;
  const text = await complete({ promptKey: "counter_draft", user, maxTokens: 6000 });
  const parsed = parseJson<CounterDraft[]>(text);
  if (!Array.isArray(parsed)) throw new Error("counter_draft: AIの返答を読み取れませんでした");
  return parsed
    .filter((d) => d && typeof d.id === "string" && typeof d.counter === "string" && d.counter.trim())
    .map((d) => ({ id: d.id, counter: d.counter.trim().slice(0, 500), because: String(d.because ?? "").trim().slice(0, 500), tag: TAGS.has(d.tag) ? d.tag : "hypothesis" }));
}
