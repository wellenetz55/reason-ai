import "server-only";

// Internal names that must never reach a customer-facing output.
// Technique names from method_techniques are appended at runtime by loadBannedTerms().
const STATIC_BANNED = [
  "回天", "脳科学対応表", "網羅版対応表", "リトマス試験紙", "増減除付", "メソッド設計補論",
  "姿勢シグナル", "適合3軸", "システムプロンプト", "method_", "techniques_json",
];

let cache: { terms: string[]; at: number } | null = null;

export async function loadBannedTerms(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.terms;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const [{ data }, { data: principles }] = await Promise.all([
    admin.from("method_techniques").select("name"),
    admin.from("method_principles").select("source"),
  ]);
  const names = (data ?? []).map((d) => d.name).filter((n): n is string => !!n && n.length >= 3);
  // 原則の出典の書名（「書名 p.12–34／書名 p.5」の書名部分）も出力に出さない
  const titles = (principles ?? [])
    .flatMap((p) => String(p.source ?? "").split("／"))
    .map((s) => s.replace(/\s*p\.[\s\S]*$/, "").replace(/（[^）]*）$/, "").trim())
    .filter((t) => t.length >= 4);
  cache = { terms: [...new Set([...STATIC_BANNED, ...names, ...titles])], at: Date.now() };
  return cache.terms;
}

/** Replaces leaked internal terms. Synchronous version uses the static list; async loads technique names. */
export function filterOutput(text: string): string {
  let out = text;
  for (const t of STATIC_BANNED) out = out.split(t).join("■");
  return out;
}

export async function filterOutputDeep(text: string): Promise<string> {
  const terms = await loadBannedTerms();
  let out = text;
  for (const t of terms) out = out.split(t).join("■");
  return out;
}
