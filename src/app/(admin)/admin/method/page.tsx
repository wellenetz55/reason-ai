import { requireOperator } from "@/lib/session";

export default async function MethodPage() {
  const { supabase } = await requireOperator();
  const [{ data: texts }, { data: facets }, { count: techniques }] = await Promise.all([
    supabase.from("method_fixed_texts").select("key, updated_at").order("key"),
    supabase.from("method_facets").select("facet, round").order("facet"),
    supabase.from("method_techniques").select("id", { count: "exact", head: true }),
  ]);
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">メソッド資産</h1>
      <p className="text-sm text-ink-2 mt-2">サーバ側だけで使う資産。顧客画面・顧客向けAPIには出ません。投入はSupabaseのSQLエディタから行います。</p>
      <dl className="mt-8 text-sm space-y-3">
        <div><dt className="text-xs text-ink-3">固定文</dt><dd className="num">{(texts ?? []).length}件 {(texts ?? []).map((t) => t.key).join(", ")}</dd></div>
        <div><dt className="text-xs text-ink-3">面の問い</dt><dd className="num">{(facets ?? []).length}件</dd></div>
        <div><dt className="text-xs text-ink-3">行動喚起の手法</dt><dd className="num">{techniques ?? 0}件</dd></div>
      </dl>
    </div>
  );
}
