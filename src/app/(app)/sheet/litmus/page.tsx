import { ClosedStage } from "@/components/ClosedStage";
import { Step0Required } from "@/components/Step0Required";
import { isStep0Ready } from "@/server/gates";
import { STAGES, isStageOpen } from "@/lib/stages";
import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { StepGuide } from "@/components/StepGuide";
import { LitmusBoard, type Niche, type Market } from "@/components/LitmusBoard";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { loadFixedText } from "@/server/ai/client";
import { MARKET_AXES, MARKS, nicheAnswered, marketScored } from "@/lib/litmus";
import { requestLitmusDrafts } from "./actions";
import { lastAiError } from "@/server/aiGuard";
import { AiNotice } from "@/components/AiNotice";
import { loadMeetingAfter } from "@/server/meetingNext";
import { MeetingNextBlock } from "@/components/MeetingNext";

export const maxDuration = 300; // AIの下書き（資料・URLの読み込みを含む）が画面側の待ち時間より先に打ち切られないように

export default async function Page() {
  const { supabase, company } = await requireCustomer();
  const stage = STAGES.find((x) => x.key === "litmus")!;
  if (!isStageOpen(stage, company.status)) return <ClosedStage stageKey="litmus" status={company.status} />;
  if (!(await isStep0Ready(supabase, company.id))) return <Step0Required stageKey="litmus" />;
  const [{ data: rows }, { data: niche, error: nErr }, { data: market }, ctx, fixed, meeting] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq, value_raw, experience_value, experience_value_v1, because_phrase").eq("company_id", company.id).eq("status", "active").order("seq"),
    supabase.from("litmus_niche").select("row_id, judged_by, q1_pain_urgency, q2_actively_seeking, ai_q1, ai_q2, ai_note, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id),
    supabase.from("litmus_market").select("row_id, scored_by, common_sense, investment, strength_asset, feasibility, beat_competitor, internal_passion, brand_purpose_fit, magnitude_text, magnitude_score, zougenjofu, total, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id),
    loadGateCtx(supabase, company.id, company.status),
    loadFixedText("round2_litmus_intro"),
    loadMeetingAfter(supabase, company.id, "litmus"),
  ]);
  const gate = stepGate("litmus", ctx);
  const aiErr = await lastAiError(supabase, company.id, "litmus.draft");
  const loadErr = nErr ? `読み込めませんでした${/ai_q1|ai_note/.test(nErr.message) ? "（SQL 0038 が未実行の可能性があります）" : ""}：${nErr.message}` : null;
  const list = (rows ?? []).map((r) => ({ id: r.id, seq: r.seq, value_raw: r.value_raw, experience: r.experience_value ?? r.experience_value_v1, because: r.because_phrase }));
  const nlist = (niche ?? []) as unknown as Niche[];
  const mlist = (market ?? []) as unknown as Market[];
  const aiDone = new Set(nlist.filter((n) => n.ai_note).map((n) => n.row_id));
  const noAi = list.filter((r) => r.value_raw && !aiDone.has(r.id)).length;
  const answered = new Set(nlist.filter((n) => nicheAnswered(n)).map((n) => n.row_id));
  const scored = new Set(mlist.filter((m) => m.scored_by === "customer" && marketScored(m)).map((m) => m.row_id));
  const doneRows = list.filter((r) => answered.has(r.id) && scored.has(r.id)).length;
  const done = list.length > 0 && doneRows === list.length;

  return (
    <div>
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-8">
        <div>
          <h1 className="serif text-[28px] leading-tight">{stage.label}</h1>
          <p className="text-ink-2 text-sm mt-2 max-w-[40em]">
            {list.length === 0 ? "まだ組がありません。" : done ? "すべての組を見極めました。確認セッション②で、ベレネッツと一緒に順位を決めます。" : `見極めが済んでいない組が${list.length - doneRows}組あります。`}
          </p>
        </div>
        <div className="sm:text-right shrink-0 serif leading-none">
          <span className="text-[56px]">{doneRows}</span>
          <span className="text-[20px] text-ink-3"> / {list.length}<span className="text-[13px] font-normal ml-1">組を見極めた</span></span>
        </div>
      </header>
      <StepGuide stageKey="litmus" />
      <div className="mt-3"><ExportButton stageKey="litmus" /></div>

      {fixed && <p className="mt-8 text-sm text-ink-2 leading-relaxed border-l-2 hairline pl-4 max-w-[40em] whitespace-pre-line">{fixed}</p>}

      <section className="mt-8 max-w-[1100px]">
        <h2 className="serif text-[18px]">見極め方</h2>
        <div className="mt-3 rounded-[var(--radius)] bg-navy-soft px-5 py-4 text-sm leading-relaxed max-w-[44em] space-y-2">
          <p><strong>1. 見込み客の切実さ（2問）</strong>：その悩みに苦痛と緊急性があるか、自分から解決策を探しているか。2問とも「いいえ」の組は、良い言葉でも選ばれる理由になりにくいので、保留の候補にします。</p>
          <p><strong>2. 市場で通用するか</strong>：{MARKET_AXES.map((a) => a.label).join("・")}を、{MARKS.map((m) => m.label).join("")}の4段階で御社が自己評価します（7つとも選ぶと「見極めた」になります）。あわせて、この組で動く大きさ（金額か件数）と、手の入れ方のメモを残します。</p>
          <p>AIの仮判定は、まだ答えていない組の欄に下書きとして入ります。合っていればそのまま保存、違えば選び直して保存してください。決めるのは御社です。ベレネッツの評価は、確認セッション②で一緒に見ます。</p>
        </div>
        <AiNotice message={loadErr ?? aiErr} />
        {noAi === 0 && list.length > 0 && (
          <p className="mt-4 rounded-[var(--radius)] bg-paper-2 px-4 py-3 text-[13px] max-w-[44em]">
            <strong>全{list.length}組に、AIの仮判定が付いています。</strong>{list.length - doneRows > 0 ? `あとは下の組ごとに、AIの判定を見ながら選び直して保存してください（御社の判定が済んでいないのは${list.length - doneRows}組）。` : ""}
          </p>
        )}
        {noAi > 0 && (
          <form action={requestLitmusDrafts} className="mt-4" data-busy-timeout="120000">
            <button className="btn-primary" type="submit">{noAi > 8 ? `AIの仮判定が無い${noAi}組のうち、まず8組に付ける` : `AIの仮判定が無い${noAi}組に付ける`}</button>
            <p className="text-[12px] text-ink-3 mt-2">{noAi > 8 ? "AIは一度に8組ずつ進めます。" : ""}御社の説明・面談記録・競合の情報から判定します。材料が足りない項目は判定しません。</p>
          </form>
        )}
      </section>

      <section className="mt-10 max-w-[1100px]">
        <LitmusBoard rows={list} niche={nlist} market={mlist} />
      </section>

      {meeting && done && <MeetingNextBlock m={meeting} done before={stage.label} about="見極めの結果をベレネッツと一緒に見て、残す言葉の順位を決めます。この面談のあと、ベレネッツが次のステップを開きます。" />}
      <NextStepBar gate={gate} meeting={done ? meeting : null} />
    </div>
  );
}
