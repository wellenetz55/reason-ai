import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { StepGuide } from "@/components/StepGuide";
import { TripleList } from "@/components/TripleList";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { loadFixedText } from "@/server/ai/client";
import { BECAUSE_TYPES } from "@/lib/because";
import { requestBecauseDrafts } from "./actions";

export const maxDuration = 60;

export default async function Page() {
  const { supabase, company } = await requireCustomer();
  const [{ data: rows }, ctx, fixed] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq, value_raw, experience_value_v1, experience_value, because_phrase, because_tag, because_only_us, because_by, trust_axis").eq("company_id", company.id).eq("status", "active").order("seq"),
    loadGateCtx(supabase, company.id, company.status),
    loadFixedText("round2_trust_intro"),
  ]);
  const gate = stepGate("trust", ctx);
  const list = (rows ?? []).map((r) => ({ ...r, because_only_us: !!r.because_only_us }));
  const withB = list.filter((r) => r.because_phrase).length;
  const onlyUs = list.filter((r) => r.because_only_us).length;
  const missing = list.length - withB;

  return (
    <div>
      <header className="flex items-end justify-between gap-8">
        <div>
          <h1 className="serif text-[28px] leading-tight">体験価値を磨く</h1>
          <p className="text-ink-2 text-sm mt-2 max-w-[56ch]">
            {missing > 0 ? `「なぜなら」が空の組が${missing}組。根拠がつくと、約束が浮つかなくなります。` : "すべての組に「なぜなら」がつきました。"}
            {onlyUs > 0 && <span className="text-navy">　「当社しかありません」と言える組 {onlyUs}。</span>}
          </p>
        </div>
        <div className="text-right shrink-0 serif leading-none">
          <span className="text-[56px]">{withB}</span>
          <span className="text-[20px] text-ink-3"> / {list.length}<span className="text-[13px] font-normal ml-1">組に根拠</span></span>
        </div>
      </header>
      <StepGuide stageKey="trust" />
      <div className="mt-3"><ExportButton stageKey="trust" /></div>

      {fixed && <p className="mt-8 text-sm text-ink-2 leading-relaxed border-l-2 hairline pl-4 max-w-[64ch] whitespace-pre-line">{fixed}</p>}

      <section className="mt-8 max-w-[800px]">
        <p className="text-[12px] text-ink-3">「なぜなら」の作り方は3種類。どれかに当てはめると書きやすくなります</p>
        <dl className="mt-2 grid gap-3 sm:grid-cols-3">
          {BECAUSE_TYPES.map((t) => (
            <div key={t.key} className="rounded-[var(--radius)] bg-paper-2 px-4 py-3">
              <dt className="serif text-[14px]">{t.label}</dt>
              <dd className="text-[12px] text-ink-2 mt-0.5 leading-relaxed">{t.hint}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[12px] text-ink-3 mt-2">「お客様を大切にするから」「最後までやり遂げるから」は約束の言い換えで、根拠ではありません。御社が<em>どうやって</em>それを実現するかを書きます。</p>
        <form action={requestBecauseDrafts} className="mt-4">
          <button className="btn-text -ml-1.5" type="submit" disabled={missing === 0}>「なぜなら」が空の{Math.min(missing, 10)}組に、AIの下書きを付ける（御社の説明から根拠を拾います）</button>
        </form>
      </section>

      <section className="mt-10 max-w-[800px]">
        <TripleList rows={list} />
      </section>

      <NextStepBar gate={gate} />
    </div>
  );
}
