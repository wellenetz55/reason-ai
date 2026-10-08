import { ClosedStage } from "@/components/ClosedStage";
import { STAGES, isStageOpen } from "@/lib/stages";
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
import { lastAiError } from "@/server/aiGuard";
import { AiNotice } from "@/components/AiNotice";

export const maxDuration = 60;

export default async function Page() {
  const { supabase, company } = await requireCustomer();
  if (!isStageOpen(STAGES.find((x) => x.key === "trust")!, company.status)) return <ClosedStage stageKey="trust" status={company.status} />;
  const [{ data: rows }, ctx, fixed] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq, value_raw, experience_value_v1, experience_value, because_phrase, because_tag, because_only_us, because_by, trust_axis").eq("company_id", company.id).eq("status", "active").order("seq"),
    loadGateCtx(supabase, company.id, company.status),
    loadFixedText("round2_trust_intro"),
  ]);
  const gate = stepGate("trust", ctx);
  const aiErr = await lastAiError(supabase, company.id, "because.draft");
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
        <h2 className="serif text-[18px]">「なぜなら」の書き方</h2>
        <div className="mt-3 rounded-[var(--radius)] bg-navy-soft px-5 py-4 text-sm leading-relaxed max-w-[72ch] space-y-2">
          <p>「だから、お客様は〜と感じられる」は<strong>お客様について</strong>語る約束です。「なぜなら」は<strong>御社について</strong>語る根拠です。御社が<em>どうやって</em>その約束を実現しているか──手順・数字・資格・体制・保証のどれかを含めて書きます。</p>
          <p>約束だけで根拠が無いと、どんなに良い言葉でも浮ついて聞こえます。「お客様を大切にするから」「最後までやり遂げるから」は約束の言い換えで、根拠ではありません。</p>
          <p>根拠はたいてい、すでに御社の中にあります。人・手順・材料・検査・実績・採用・研修・お客様の声・専門性。探す角度は次の3つです。</p>
        </div>
        <dl className="mt-4 grid gap-3 md:grid-cols-3">
          {BECAUSE_TYPES.map((t) => (
            <div key={t.key} className="rounded-[var(--radius)] bg-paper-2 px-4 py-4 flex flex-col">
              <dt className="serif text-[15px]">{t.label}</dt>
              <dd className="text-[13px] text-ink mt-1 leading-snug">{t.one}</dd>
              <dd className="text-[12px] text-ink-2 mt-2 leading-relaxed">{t.what}</dd>
              <dd className="text-[12px] text-ink-2 mt-2 leading-relaxed"><span className="text-navy">自問：</span>{t.ask}</dd>
              <dd className="text-[12px] text-ink-3 mt-2 leading-relaxed border-t hairline pt-2">例：{t.example}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[12px] text-ink-3 mt-3 max-w-[72ch]">いちばん強いのは「〜するのは、当社しかありません」と言える根拠です。言えそうな組には印をつけてください。無い場合は、お客様が避けたいと感じていることを御社が引き受ける約束を新しく作る（生み出された根拠）ことも検討します。</p>
        <AiNotice message={aiErr} />
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
