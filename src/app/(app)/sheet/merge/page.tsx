import { ClosedStage } from "@/components/ClosedStage";
import { STAGES, isStageOpen } from "@/lib/stages";
import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { StepGuide } from "@/components/StepGuide";
import { BiasReport } from "@/components/BiasReport";
import { VagueList } from "@/components/VagueList";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { runVagueCheck } from "./actions";
import { fmtMeeting } from "@/lib/meetings";
import { lastAiError } from "@/server/aiGuard";
import { AiNotice } from "@/components/AiNotice";

export const maxDuration = 60;

export default async function Page() {
  const { supabase, company } = await requireCustomer();
  if (!isStageOpen(STAGES.find((x) => x.key === "merge")!, company.status)) return <ClosedStage stageKey="merge" status={company.status} />;
  const [{ data: rows }, { data: diags }, ctx] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq, facet, target, value_raw, experience_value_v1, status").eq("company_id", company.id).eq("status", "active").order("seq"),
    supabase.from("row_diagnoses").select("row_id, vague_score, issues, suggestion_value, suggestion_experience, resolved, checked_at, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id),
    loadGateCtx(supabase, company.id, company.status),
  ]);
  const gate = stepGate("merge", ctx);
  const aiErr = await lastAiError(supabase, company.id, "vague_check.run");
  const active = rows ?? [];
  const dlist = (diags ?? []).map((d) => ({ ...d, issues: (d.issues ?? []) as string[] }));
  const lastChecked = dlist.map((d) => d.checked_at).sort().at(-1);
  const open = dlist.filter((d) => d.resolved == null && d.vague_score >= 1).length;

  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">まとめて絞る</h1>
      <StepGuide stageKey="merge" />
      <div className="mt-3"><ExportButton stageKey="merge" /></div>

      <div className="mt-12 space-y-14 max-w-[800px]">
        <BiasReport rows={active} />

        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="serif text-[20px]">ふわっと診断</h2>
              <p className="text-sm text-ink-2 mt-1 max-w-[56ch]">どの会社でも言える語には黄色の印がつきます。AIに点検させると、数字や固有名詞の有無、体験価値が機能の言い換えになっていないかを見て、言い直し案を出します。直すかどうかは御社が決めます。</p>
            </div>
            <form action={runVagueCheck}>
              <button className="btn-primary" type="submit" disabled={active.length === 0}>{lastChecked ? "AIにもう一度点検させる" : "AIに点検させる"}</button>
            </form>
          </div>
          <AiNotice message={aiErr} />
          {lastChecked && <p className="text-[12px] text-ink-3 mt-2 num">最終点検 {fmtMeeting(lastChecked)}　未対応 {open} 組</p>}
          <VagueList rows={active} diags={dlist} />
        </section>

        <section>
          <h2 className="serif text-[20px]">統合して最終案を決める</h2>
          <p className="text-sm text-ink-2 mt-1">診断を一通り見終えたら、ここで似た組をまとめます（準備中）。</p>
        </section>
      </div>

      <NextStepBar gate={gate} />
    </div>
  );
}
