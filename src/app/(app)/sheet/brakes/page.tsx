import { ClosedStage } from "@/components/ClosedStage";
import { Step0Required } from "@/components/Step0Required";
import { isStep0Ready } from "@/server/gates";
import { STAGES, isStageOpen } from "@/lib/stages";
import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { StepGuide } from "@/components/StepGuide";
import { BrakeBoard, type Brake } from "@/components/BrakeBoard";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { loadFixedText } from "@/server/ai/client";
import { BRAKE_KINDS } from "@/lib/brakes";
import { requestBrakeDrafts } from "./actions";
import { lastAiError } from "@/server/aiGuard";
import { AiNotice } from "@/components/AiNotice";

export const maxDuration = 90;

export default async function Page() {
  const { supabase, company } = await requireCustomer();
  if (!isStageOpen(STAGES.find((x) => x.key === "brakes")!, company.status)) return <ClosedStage stageKey="brakes" status={company.status} />;
  if (!(await isStep0Ready(supabase, company.id))) return <Step0Required stageKey="brakes" />;
  const [{ data: rows }, { data: brakes }, ctx, fixed] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq, value_raw, experience_value, experience_value_v1").eq("company_id", company.id).eq("status", "active").order("seq"),
    supabase.from("brakes").select("id, row_id, kind, customer_words, source_tag, evidence_tag, status, created_by, approved_at, created_at, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id).order("created_at"),
    loadGateCtx(supabase, company.id, company.status),
    loadFixedText("round2_brakes_intro"),
  ]);
  const gate = stepGate("brakes", ctx);
  const aiErr = await lastAiError(supabase, company.id, "brakes.draft");
  const list = (rows ?? []).map((r) => ({ id: r.id, seq: r.seq, value_raw: r.value_raw, experience: r.experience_value ?? r.experience_value_v1 }));
  const blist: Brake[] = (brakes ?? []).map((b) => ({ id: b.id, row_id: b.row_id, kind: b.kind, customer_words: b.customer_words, source_tag: b.source_tag, evidence_tag: b.evidence_tag, status: b.status, created_by: b.created_by, approved_at: b.approved_at }));
  const activeB = blist.filter((b) => b.status === "active");
  const rowsWith = new Set(activeB.map((b) => b.row_id));
  const missing = list.filter((r) => !rowsWith.has(r.id)).length;
  const kinds = new Set(activeB.map((b) => b.kind));
  const hasPublic = activeB.some((b) => b.source_tag === "public_voice");

  return (
    <div>
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-8">
        <div>
          <h1 className="serif text-[28px] leading-tight">お客様のブレーキ</h1>
          <p className="text-ink-2 text-sm mt-2 max-w-[40em]">
            {list.length === 0 ? "まだ組がありません。先に STEP 1・2 で提供価値・体験価値の組を残してください。" : missing > 0 ? `ブレーキがまだ無い組が${missing}組。お客様が御社を選ぶのをためらう理由を、組ごとに4種類の角度で書き出します。` : "すべての組にブレーキがつきました。4種類がそろえば、次の STEP 4 で一つずつ外していきます。"}
          </p>
        </div>
        <div className="sm:text-right shrink-0 serif leading-none">
          <span className="text-[56px]">{kinds.size}</span>
          <span className="text-[20px] text-ink-3"> / 4<span className="text-[13px] font-normal ml-1">種類のブレーキ</span></span>
        </div>
      </header>
      <StepGuide stageKey="brakes" />
      <div className="mt-3"><ExportButton stageKey="brakes" /></div>

      {fixed && <p className="mt-8 text-sm text-ink-2 leading-relaxed border-l-2 hairline pl-4 max-w-[40em] whitespace-pre-line">{fixed}</p>}

      <section className="mt-8 max-w-[1100px]">
        <h2 className="serif text-[18px]">4つの不（ブレーキ）</h2>
        <p className="text-sm text-ink-2 mt-2 max-w-[44em]">ブレーキは<strong>御社の言い分ではなく、お客様（買い手）の心の声</strong>で書きます。「本当か？」「今のままでいい」「うちには合わない」「今じゃない」。実際に言われた言葉・断り文句があれば、それがいちばん強い材料です。</p>
        <dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {BRAKE_KINDS.map((k) => (
            <div key={k.key} className="rounded-[var(--radius)] bg-paper-2 px-4 py-4 flex flex-col">
              <dt className="serif text-[15px]">{k.label}<span className="text-[12px] text-ink-3 font-normal ml-2">{k.one}</span></dt>
              <dd className="text-[12px] text-ink-2 mt-2 leading-relaxed">{k.ask}</dd>
              <dd className="text-[12px] text-ink-3 mt-2 leading-relaxed border-t hairline pt-2">例：「{k.example}」</dd>
            </div>
          ))}
        </dl>
        <p className="text-[12px] text-ink-3 mt-3 max-w-[44em]">
          根拠タグ：<span className="text-fact">事実</span>＝実際に言われた言葉がある／<span className="text-verify">要確認</span>＝ありそうだが確かめていない／<span className="text-hypo">仮説</span>＝推測。仮説は承認しても黄色のままで、STEP 7 で証拠がつくと事実に変わります。
        </p>
        {hasPublic && <p className="mt-3 rounded-[var(--radius)] bg-warm-soft px-4 py-3 text-[13px] max-w-[44em]">出所が「公開の声（レビュー・コメント）」のブレーキがあります。原文はこのシートの中だけで使い、営業資料・Webなどの販促物に転載しないでください。</p>}
        <AiNotice message={aiErr} />
        {missing > 0 && (
          <form action={requestBrakeDrafts} className="mt-4" data-busy-timeout="120000">
            <button className="btn-primary" type="submit">ブレーキが無い{Math.min(missing, 10)}組に、AIの下書きを付ける</button>
            <p className="text-[12px] text-ink-3 mt-2">御社の説明・適合診断の聞き取り・面談記録・資料から、お客様の言葉を拾います。材料に無いものは「仮説」として出します。直すかどうかは御社が決めます。</p>
          </form>
        )}
      </section>

      <section className="mt-10 max-w-[1100px]">
        <BrakeBoard rows={list} brakes={blist} />
      </section>

      <NextStepBar gate={gate} />
    </div>
  );
}
