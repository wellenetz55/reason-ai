import { ClosedStage } from "@/components/ClosedStage";
import { Step0Required } from "@/components/Step0Required";
import { isStep0Ready } from "@/server/gates";
import { STAGES, isStageOpen } from "@/lib/stages";
import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { StepGuide } from "@/components/StepGuide";
import { loadSeals } from "@/server/seals";
import { sealOn, SEAL_LABEL } from "@/lib/seals";
import { CounterBoard, type CounterBrake } from "@/components/CounterBoard";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { loadFixedText } from "@/server/ai/client";
import { hasHole } from "@/lib/counter";
import { requestCounterDrafts } from "./actions";
import { lastAiError } from "@/server/aiGuard";
import { AiNotice } from "@/components/AiNotice";
import { loadMeetingAfter } from "@/server/meetingNext";
import { MeetingNextBlock } from "@/components/MeetingNext";

export const maxDuration = 300; // AIの下書き（資料・URLの読み込みを含む）が画面側の待ち時間より先に打ち切られないように

export default async function Page() {
  const { supabase, company } = await requireCustomer();
  if (!isStageOpen(STAGES.find((x) => x.key === "counter")!, company.status)) return <ClosedStage stageKey="counter" status={company.status} />;
  if (!(await isStep0Ready(supabase, company.id))) return <Step0Required stageKey="counter" />;
  const [{ data: rows }, { data: brakes, error: bErr }, ctx, fixed, meeting] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq, value_raw, experience_value, experience_value_v1").eq("company_id", company.id).eq("status", "active").order("seq"),
    supabase.from("brakes").select("id, row_id, kind, customer_words, counter_message, because, because_tag, counter_by, counter_approved_at, counter_history, created_at, sheet_rows!inner(company_id, status)").eq("sheet_rows.company_id", company.id).eq("sheet_rows.status", "active").eq("status", "active").order("created_at"),
    loadGateCtx(supabase, company.id, company.status),
    loadFixedText("round2_counter_intro"),
    loadMeetingAfter(supabase, company.id, "counter"),
  ]);
  const gate = stepGate("counter", ctx);
  const aiErr = await lastAiError(supabase, company.id, "counter.draft");
  const loadErr = bErr ? `ブレーキを読み込めませんでした${/because_tag|counter_/.test(bErr.message) ? "（SQL 0035 が未実行の可能性があります）" : ""}：${bErr.message}` : null;
  const list = (rows ?? []).map((r) => ({ id: r.id, seq: r.seq, value_raw: r.value_raw, experience: r.experience_value ?? r.experience_value_v1 }));
  const seals = await loadSeals(supabase, company.id);
  const blist: CounterBrake[] = (brakes ?? []).map((b) => {
    // 封（確認セッション②）：根拠が「事実」の答えだけが封の対象（事実でなければ仮封で、理由なしで直せる）
    const x = b.counter_message ? sealOn(seals, "brakes.counter_message", b.created_at, b.because_tag ?? "hypothesis") : null;
    return {
      id: b.id, row_id: b.row_id, kind: b.kind, customer_words: b.customer_words, counter_message: b.counter_message, because: b.because,
      because_tag: b.because_tag ?? "hypothesis", counter_by: b.counter_by, counter_approved_at: b.counter_approved_at, counter_history: (b.counter_history ?? []) as string[],
      sealed: x ? SEAL_LABEL[x.session] : null,
    };
  });
  const answered = blist.filter((b) => b.counter_message?.trim());
  const complete = answered.filter((b) => !hasHole(b.counter_message) && !hasHole(b.because));
  const empty = blist.filter((b) => b.customer_words && !b.counter_message?.trim()).length;
  const holes = answered.length - complete.length;
  const facts = complete.filter((b) => b.because_tag === "fact").length;
  const done = blist.length > 0 && complete.length === blist.length;

  return (
    <div>
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-8">
        <div>
          <h1 className="serif text-[28px] leading-tight">ブレーキを外す</h1>
          <p className="text-ink-2 text-sm mt-2 max-w-[40em]">
            {blist.length === 0 ? "外すブレーキがまだありません。先に STEP 3 でお客様のブレーキを書き出してください。"
              : done ? "すべてのブレーキに、先回りの答えがつきました。"
              : `答えがまだ無いブレーキ ${empty}件${holes > 0 ? `、○ の穴が残っている答え ${holes}件` : ""}。`}
            {complete.length > 0 && <span className="text-fact">　根拠が「事実」の答え {facts}件。</span>}
          </p>
        </div>
        <div className="sm:text-right shrink-0 serif leading-none">
          <span className="text-[56px]">{complete.length}</span>
          <span className="text-[20px] text-ink-3"> / {blist.length}<span className="text-[13px] font-normal ml-1">枚のブレーキを外した</span></span>
        </div>
      </header>
      <StepGuide stageKey="counter" />
      <div className="mt-3"><ExportButton stageKey="counter" /></div>

      {fixed && <p className="mt-8 text-sm text-ink-2 leading-relaxed border-l-2 hairline pl-4 max-w-[40em] whitespace-pre-line">{fixed}</p>}

      <section className="mt-8 max-w-[1100px]">
        <h2 className="serif text-[18px]">先回りの答えの書き方</h2>
        <div className="mt-3 rounded-[var(--radius)] bg-navy-soft px-5 py-4 text-sm leading-relaxed max-w-[44em] space-y-2">
          <p><strong>⑤ 先回りの答え</strong>は、お客様の心の声に「それなら安心だ」と思ってもらう一文です。言い負かす反論ではありません。お客様の言葉を受けて、御社の言葉で答えます。</p>
          <p>数字・条件・固有名詞を入れると強くなります。分からないところは「<mark className="bg-warm-soft text-warm font-semibold px-0.5 rounded-sm">○</mark>店で<mark className="bg-warm-soft text-warm font-semibold px-0.5 rounded-sm">○</mark>台」のように穴のまま残し、確かめてから埋めてください。穴が残っている答えは完成扱いになりません。</p>
          <p><strong>⑥ なぜなら</strong>は、その答えが本当だと言える根拠です。<span className="text-fact">事実</span>（確認済み）／<span className="text-verify">要確認</span>（数字・条件を確かめたい）／<span className="text-hypo">仮説</span>（根拠なし）の印をつけます。組ごとに「事実 0件」が出ているところは、根拠が弱いサインです。</p>
        </div>
        <AiNotice message={loadErr ?? aiErr} />
        {empty > 0 && (
          <form action={requestCounterDrafts} className="mt-4" data-busy-timeout="300000">
            <button className="btn-primary" type="submit">{empty > 8 ? `答えが無い${empty}件のうち、まず8件にAIの下書きを付ける` : `答えが無い${empty}件に、AIの下書きを付ける`}</button>
            <p className="text-[12px] text-ink-3 mt-2">{empty > 8 ? "AIは一度に8件ずつ進めます。押すたびに次の8件に下書きが付きます。" : ""}御社の説明・聞き取り・面談記録から答えと根拠を拾います。分からない数字は「○」の穴のまま出します。直すかどうかは御社が決めます。</p>
          </form>
        )}
      </section>

      <section className="mt-10 max-w-[1100px]">
        <CounterBoard rows={list} brakes={blist} />
      </section>

      {meeting && done && <MeetingNextBlock m={meeting} done before="ブレーキを外す" about="ブレーキと先回りの答えを、ベレネッツと一緒に点検します。面談を待たずに、次の STEP 5「体験価値を磨く」に進んで構いません。" />}
      <NextStepBar gate={gate} meeting={done ? meeting : null} />
    </div>
  );
}
