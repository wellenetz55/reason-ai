import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { FACETS, facetForToday, loadFacetPrompt } from "@/server/sheet";
import { loadFixedText } from "@/server/ai/client";
import { addRow, requestDraft, requestExperienceDrafts } from "./actions";
import { RowList } from "@/components/RowList";
import { FacetBars } from "@/components/FacetBars";
import { StepGuide } from "@/components/StepGuide";

export default async function DivergePage() {
  const { supabase, company } = await requireCustomer();
  const [{ data: rows }, { data: progress }, fixed] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq, value_raw, experience_value_v1, target, one_liner, target_tag, facet, round, status, created_by").eq("company_id", company.id).order("seq"),
    supabase.from("v_divergence_progress").select("*").eq("company_id", company.id).maybeSingle(),
    loadFixedText("round1_intro"),
  ]);
  const byFacet = (progress?.by_facet ?? {}) as Record<string, number>;
  const count = progress?.pair_count ?? 0;      // 対になっている組数
  const total = progress?.row_count ?? 0;       // 行数（体験価値が空も含む）
  const missing = total - count;
  const { facet, round } = facetForToday(byFacet, progress?.max_round ?? 1);
  const tpl = await loadFacetPrompt(facet.key, round);
  const gate = stepGate("diverge", await loadGateCtx(supabase, company.id, company.status));

  return (
    <div>
      <header className="flex items-end justify-between gap-8">
        <div>
          <h1 className="serif text-[28px] leading-tight">提供価値・体験価値を出す</h1>
          <p className="text-ink-2 text-sm mt-2 max-w-[56ch]">
            {count < 20 ? `あと${20 - count}組で、まとめて絞る段階に進めます。目標は30組。` : count < 30 ? `${count}組。目標の30組まで出し切ると、絞ったあとに残る言葉が強くなります。` : `${count}組。出し切りました。まとめて絞る段階へ。`}
            {missing > 0 && <span className="text-warm">　体験価値が空の行が{missing}行。</span>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="serif leading-none">
            <span className="text-[56px]">{count}</span>
            <span className="text-[20px] text-ink-3"> / 30<span className="text-[13px] font-normal ml-1">組</span></span>
          </div>
          <FacetBars facets={FACETS.map((f) => ({ key: f.key, label: f.label, short: f.short, n: byFacet[f.key] ?? 0 }))} />
        </div>
      </header>

      <StepGuide stageKey="diverge" />
      <div className="mt-3"><ExportButton stageKey="diverge" /></div>

      <section className="mt-10">
        <p className="text-xs text-ink-3">今日の面 · {round}周目</p>
        <h2 className="serif text-[22px] mt-1">{facet.label}</h2>
        <p className="text-sm text-ink-2 mt-1 max-w-[56ch]">{tpl?.prompt_template ?? facet.hint}</p>
        {tpl?.helper_examples && <p className="text-xs text-ink-3 mt-2 whitespace-pre-line">{tpl.helper_examples}</p>}

        {fixed && <p className="mt-6 text-sm text-ink-2 leading-relaxed border-l-2 hairline pl-4 max-w-[64ch] whitespace-pre-line">{fixed}</p>}

        <form action={addRow} className="mt-6 max-w-[760px]">
          <input type="hidden" name="facet" value={facet.key} />
          <input type="hidden" name="round" value={round} />
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-[1fr_1fr]">
            <label className="block">
              <span className="text-xs text-ink-2">御社は、</span>
              <input name="value" required placeholder="〜できる（提供価値）" className="block w-full border-b hairline py-2 text-base" />
            </label>
            <label className="block">
              <span className="text-xs text-ink-2">だから、お客様は、</span>
              <input name="experience" placeholder="〜と感じることができる（体験価値）" className="block w-full border-b hairline py-2 text-base" />
            </label>
          </div>
          <div className="mt-3 flex gap-3 items-end">
            <label className="w-48">
              <span className="text-xs text-ink-2">誰向け（任意）</span>
              <input name="target" className="block w-full border-b hairline py-2 text-sm" />
            </label>
            <button className="btn-primary" type="submit">1組足す</button>
            <span className="text-[12px] text-ink-3">体験価値は後から埋めてもかまいません</span>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap gap-1">
          <form action={requestDraft}>
            <input type="hidden" name="facet" value={facet.key} />
            <input type="hidden" name="round" value={round} />
            <button className="btn-text" type="submit">この面でAIに下書きを出させる（対で）</button>
          </form>
          {missing > 0 && (
            <form action={requestExperienceDrafts}>
              <button className="btn-text" type="submit">体験価値が空の{Math.min(missing, 10)}行に、AIの下書きを付ける</button>
            </form>
          )}
        </div>
      </section>

      <section className="mt-12">
        <RowList rows={rows ?? []} facets={FACETS.map((f) => ({ key: f.key, label: f.label }))} />
      </section>
      <NextStepBar gate={gate} />
    </div>
  );
}
