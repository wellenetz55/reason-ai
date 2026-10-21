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
    .flatMap((p) => String(p.source ?? "").split(/／|\s\/\s|\/(?=[^\s/]+\s*(?:pp?\.|P\.|ｐ|頁))/))
    .map((s) => s.replace(/\s*(pp?\.|P\.|ｐ|頁)[\s\S]*$/, "").replace(/[『』「」]/g, "").replace(/（[^）]*）$/, "").trim())
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

/**
 * メソッド本文（指示文・原則・手法の使い方・判定手引き）を、14文字以上のまとまりに分けて覚えておく。
 * AIが本文をそのまま書き写した場合（資料に仕込まれた指示に従ってしまった等）に、その部分を伏せるため。
 * 顧客画面にもともと出す固定文（*_intro・STEP 0 の問い）は対象外。
 */
let segCache: { segs: string[]; at: number } | null = null;
async function loadMethodSegments(): Promise<string[]> {
  if (segCache && Date.now() - segCache.at < 10 * 60 * 1000) return segCache.segs;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const [{ data: prompts }, { data: principles }, { data: techniques }, { data: fixed }] = await Promise.all([
    admin.from("method_prompts").select("body").eq("is_active", true),
    admin.from("method_principles").select("principle, usage"),
    admin.from("method_techniques").select("usage"),
    admin.from("method_fixed_texts").select("key, body").in("key", ["diag_guide"]),
  ]);
  const texts = [
    ...(prompts ?? []).map((r) => r.body),
    ...(principles ?? []).flatMap((r) => [r.principle, r.usage]),
    ...(techniques ?? []).map((r) => r.usage),
    ...(fixed ?? []).map((r) => r.body),
  ].filter((t): t is string => typeof t === "string" && t.length > 0);
  const segs = new Set<string>();
  for (const t of texts) {
    for (const part of t.split(/[。\n！？]/)) {
      const x = part.replace(/^[\s\-・*]+/, "").trim();
      if (x.length >= 14) segs.add(x);
    }
  }
  segCache = { segs: [...segs].sort((a, b) => b.length - a.length), at: Date.now() };
  return segCache.segs;
}

/** JSON文字列の \uXXXX 表記を文字に戻す（エスケープで禁止語をすり抜けさせない）。" \ 制御文字は戻さない */
function unescapeUnicode(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => {
    const c = parseInt(h, 16);
    return c < 0x20 || c === 0x22 || c === 0x5c ? m : String.fromCharCode(c);
  });
}

export async function filterOutputDeep(text: string): Promise<string> {
  const [terms, segs] = await Promise.all([loadBannedTerms(), loadMethodSegments().catch(() => [] as string[])]);
  let out = unescapeUnicode(text);
  for (const t of terms) out = out.split(t).join("■");
  for (const sgm of segs) if (out.includes(sgm)) out = out.split(sgm).join("■");
  return out;
}
