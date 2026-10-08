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
  if (!isStageOpen(STAGES.find((x) => x.key === "deploy")!, company.status)) return <ClosedStage stageKey="deploy" status={company.status} />;
  const gate = stepGate("deploy", await loadGateCtx(supabase, company.id, company.status));
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">接点に展開する</h1>
      <StepGuide stageKey="deploy" />
      <div className="mt-3"><ExportButton stageKey="deploy" /></div>
      <p className="text-ink-2 text-sm mt-2">この段階はまだ準備中です。先に「提供価値を出す」を進めてください。</p>
      <NextStepBar gate={gate} />
    </div>
  );
}
