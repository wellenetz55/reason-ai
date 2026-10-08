import { ClosedStage } from "@/components/ClosedStage";
import { STAGES, isStageOpen } from "@/lib/stages";
import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { StepGuide } from "@/components/StepGuide";
export default async function Page() {
  const { supabase, company } = await requireCustomer();
  if (!isStageOpen(STAGES.find((x) => x.key === "litmus")!, company.status)) return <ClosedStage stageKey="litmus" status={company.status} />;
  const gate = stepGate("litmus", await loadGateCtx(supabase, company.id, company.status));
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">リトマス試験紙</h1>
      <StepGuide stageKey="litmus" />
      <div className="mt-3"><ExportButton stageKey="litmus" /></div>
      <p className="text-ink-2 text-sm mt-2">この段階はまだ準備中です。先に「提供価値を出す」を進めてください。</p>
      <NextStepBar gate={gate} />
    </div>
  );
}
