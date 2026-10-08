import { requireCustomer } from "@/lib/session";
import { FACETS, facetForToday, loadFacetPrompt } from "@/server/sheet";
import { loadFixedText } from "@/server/ai/client";
import { addRow, requestDraft } from "./actions";
import { RowList } from "@/components/RowList";
import { FacetBars } from "@/components/FacetBars";
import { StepGuide } from "@/components/StepGuide";

export default async function DivergePage() {
  const { supabase, company } = await requireCustomer();
  const [{ data: rows }, { data: progress }, fixed] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq, value_raw, target, one_liner, target_tag, facet, round, status, created_by").eq("company_id", company.id).order("seq"),
    supabase.from("v_divergence_progress").select("*").eq("company_id", company.id).maybeSingle(),
    loadFixedText("round1_intro"),
  ]);
  const byFacet = (progress?.by_facet ?? {}) as Record<string, number>;
  const count = progress?.row_count ?? 0;
  const { facet, round } = facetForToday(byFacet, progress?.max_round ?? 1);
  const tpl = await loadFacetPrompt(facet.key, round);

  return (
    <div>
      <header className="flex items-end justify-between gap-8">
        <div>
          <h1 className="serif text-[28px] leading-tight">提供価値を出す</h1>
          <p className="text-ink-2 text-sm mt-2 max-w-[56ch]">
            {count < 20 ? `あと${20 - count}行で、まとめて絞る段階に進めます。目標は30行。` : count < 30 ? `${count}行。目標の30行まで出し切ると、絞ったあとに残る言葉が強くなります。` : `${count}行。出し切りました。まとめて絞る段階へ。`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="serif leading-none">
            <span className="text-[56px]">{count}</span>
            <span className="text-[20px] text-ink-3"> / 30</span>
          </div>
          <FacetBars facets={FACETS.map((f) => ({ key: f.key, label: f.label, n: byFacet[f.key] ?? 0 }))} />
        </div>
      </header>

      <StepGuide stageKey="diverge" />

      {fixed && <p className="mt-8 text-sm text-ink-2 leading-relaxed border-l-2 hairline pl-4 max-w-[64ch] whitespace-pre-line">{fixed}</p>}

      <section className="mt-10">
        <p className="text-xs text-ink-3">今日の面 · {round}周目</p>
        <h2 className="serif text-[22px] mt-1">{facet.label}</h2>
        <p className="text-sm text-ink-2 mt-1 max-w-[56ch]">{tpl?.prompt_template ?? facet.hint}</p>
        {tpl?.helper_examples && <p className="text-xs text-ink-3 mt-2 whitespace-pre-line">{tpl.helper_examples}</p>}

        <form action={addRow} className="mt-6 flex gap-3 items-end">
          <input type="hidden" name="facet" value={facet.key} />
          <input type="hidden" name="round" value={round} />
          <label className="flex-1">
            <span className="text-xs text-ink-2">御社は、</span>
            <input name="value" required placeholder="〜できる" className="block w-full border-b hairline py-2 text-base" />
          </label>
          <label className="w-40">
            <span className="text-xs text-ink-2">誰向け（任意）</span>
            <input name="target" className="block w-full border-b hairline py-2 text-sm" />
          </label>
          <button className="btn-primary" type="submit">行を足す</button>
        </form>

        <form action={requestDraft} className="mt-3">
          <input type="hidden" name="facet" value={facet.key} />
          <input type="hidden" name="round" value={round} />
          <button className="btn-text" type="submit">この面でAIに下書きを出させる</button>
        </form>
      </section>

      <section className="mt-12">
        <RowList rows={rows ?? []} facets={FACETS.map((f) => ({ key: f.key, label: f.label }))} />
      </section>
    </div>
  );
}
