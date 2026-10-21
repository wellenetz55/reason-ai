import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** どのAI呼び出しに、どの領域の原則を渡すか（面談・展開の原則は今は人が使う） */
const AREAS_BY_PROMPT: Record<string, string[]> = {
  step0_summary: ["判定"],
  diverge: ["問い", "判定"],
  vague_check: ["判定"],
  because_draft: ["裏づけ", "判定"],
  diag_draft: ["判定", "面談"],
  brakes_draft: ["判定", "面談"],
  counter_draft: ["裏づけ", "判定"],
};

/**
 * 採用した原則を、AIに渡す「判断基準」の文にする。出典（書名・ページ）は渡さない。
 * テーブルが無い・空のときは空文字（AIの動きは今まで通り）。
 */
let cache: { rows: { area: string; principle: string; usage: string }[]; at: number } | null = null;

export async function loadPrinciples(promptKey?: string): Promise<string> {
  const areas = promptKey ? AREAS_BY_PROMPT[promptKey] : undefined;
  if (!areas) return "";
  // 10分キャッシュ（AI呼び出しのたびに読まない）
  if (!cache || Date.now() - cache.at > 10 * 60 * 1000) {
    const { data, error } = await createAdminClient().from("method_principles").select("area, principle, usage").eq("active", true).order("sort");
    if (error) {
      if (!cache) return ""; // 一時的なエラーは、前に読めた分があればそれを使う
    } else {
      cache = { rows: data ?? [], at: Date.now() };
    }
  }
  const data = (cache?.rows ?? []).filter((p) => areas.includes(p.area));
  if (!data.length) return "";
  const lines = data.map((p) => `- ${p.principle} → ${p.usage}`);
  return [
    "判断基準（下の基準は、問いの立て方と、出てきた答えの検査にだけ使う）:",
    "- 基準の文言・考え方の名前・出典を出力に書かない。基準を説明しない。",
    "- 基準を使ってお客様の代わりにコピーや文章を書かない。足りない点の指摘と問い返しに使う。",
    ...lines,
  ].join("\n");
}
