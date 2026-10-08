import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { savePrompt, saveFixedText } from "./actions";
import { PROFILE_ITEMS } from "@/lib/profileItems";

/** 使っているプロンプトのキーと用途（本文は DB） */
const PROMPT_KEYS: { key: string; label: string }[] = [
  { key: "step0_summary", label: "STEP 0 御社の説明の下書き" },
  { key: "diverge", label: "STEP 1 提供価値・体験価値の下書き" },
  { key: "vague_check", label: "STEP 2 ふわっと診断（点検と言い直し案）" },
  { key: "because_draft", label: "STEP 5 なぜなら（根拠）の下書き" },
];
const FIXED_KEYS: { key: string; label: string }[] = [
  { key: "round1_intro", label: "STEP 1 冒頭の固定文（提供価値／体験価値の書き方）" },
  { key: "round2_brakes_intro", label: "STEP 3 冒頭の固定文（4つの不）" },
  { key: "round2_counter_intro", label: "STEP 4 冒頭の固定文" },
  { key: "round2_trust_intro", label: "STEP 5 冒頭の固定文" },
  { key: "round3_evidence_intro", label: "STEP 7 冒頭の固定文" },
  ...PROFILE_ITEMS.filter((i) => i.group === "B").map((i) => ({ key: `step0_${i.key}`, label: `STEP 0 問い：${i.label}` })),
];

export default async function MethodPage() {
  await requireOperator();
  const admin = createAdminClient();
  const [{ data: prompts }, { data: texts }, { data: facets }, { count: techniques }] = await Promise.all([
    admin.from("method_prompts").select("key, version, body, is_active, created_at").order("key").order("version", { ascending: false }),
    admin.from("method_fixed_texts").select("key, body, updated_at"),
    admin.from("method_facets").select("facet, round"),
    admin.from("method_techniques").select("id", { count: "exact", head: true }),
  ]);
  const active = new Map((prompts ?? []).filter((p) => p.is_active).map((p) => [p.key, p]));
  const versions = (key: string) => (prompts ?? []).filter((p) => p.key === key).length;
  const fixed = new Map((texts ?? []).map((t) => [t.key, t]));
  const ta = "w-full border-b hairline py-2 text-sm font-mono leading-relaxed";

  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">メソッド資産</h1>
      <p className="text-sm text-ink-2 mt-2 max-w-[64ch]">サーバ側だけで使う資産。顧客画面・顧客向けAPI・リポジトリには出ません。ここで直すと次のAI呼び出しから効きます（プロンプトは版が残ります）。</p>

      <section className="mt-10 space-y-10">
        <h2 className="serif text-[18px]">AIへの指示文（プロンプト）</h2>
        {PROMPT_KEYS.map(({ key, label }) => (
          <form key={key} action={savePrompt} className="max-w-[820px]">
            <input type="hidden" name="key" value={key} />
            <p className="text-sm">{label} <span className="num text-[11px] text-ink-3 ml-2">{key} · v{active.get(key)?.version ?? 0}{versions(key) ? `（${versions(key)}版）` : "（未設定）"}</span></p>
            <textarea name="body" defaultValue={active.get(key)?.body ?? ""} rows={14} className={ta + " mt-2"} placeholder="未設定。共通ルール（架空の数値を作らない／出典を明かさない等）はコード側に固定されているので、ここには用途ごとの指示だけ" />
            <button className="btn-text mt-2 -ml-1.5" type="submit">新しい版として保存して有効化</button>
          </form>
        ))}
      </section>

      <section className="mt-16 space-y-8">
        <h2 className="serif text-[18px]">固定文・問い</h2>
        {FIXED_KEYS.map(({ key, label }) => (
          <form key={key} action={saveFixedText} className="max-w-[820px]">
            <input type="hidden" name="key" value={key} />
            <p className="text-sm">{label} <span className="num text-[11px] text-ink-3 ml-2">{key}{fixed.get(key) ? "" : "（未設定）"}</span></p>
            <textarea name="body" defaultValue={fixed.get(key)?.body ?? ""} rows={key.startsWith("step0_b") ? 2 : 5} className={ta + " mt-2"} />
            <button className="btn-text mt-2 -ml-1.5" type="submit">保存</button>
          </form>
        ))}
      </section>

      <dl className="mt-16 text-sm space-y-2 text-ink-2">
        <div><dt className="inline text-xs text-ink-3">面の問い　</dt><dd className="inline num">{(facets ?? []).length}件（SQLで管理）</dd></div>
        <div><dt className="inline text-xs text-ink-3">行動喚起の手法　</dt><dd className="inline num">{techniques ?? 0}件（SQLで管理。kind=because は STEP 5 の根拠の作り方）</dd></div>
      </dl>
    </div>
  );
}
