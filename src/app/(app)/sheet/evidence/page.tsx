import { ClosedStage } from "@/components/ClosedStage";
import { STAGES, isStageOpen } from "@/lib/stages";
import { ExportButton } from "@/components/ExportButton";
import { requireCustomer } from "@/lib/session";
import { StepGuide } from "@/components/StepGuide";
export default async function Page() {
  const { company } = await requireCustomer();
  if (!isStageOpen(STAGES.find((x) => x.key === "evidence")!, company.status)) return <ClosedStage stageKey="evidence" status={company.status} />;
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">証拠を集める</h1>
      <StepGuide stageKey="evidence" />
      <div className="mt-3"><ExportButton stageKey="evidence" /></div>
      <p className="mt-6 rounded-[var(--radius)] bg-paper-2 px-5 py-4 text-sm text-ink-2 max-w-[60ch]">この段階の画面は、いま準備中です。始めるときは、ベレネッツからご案内します。それまでは前の段階の見直しや、宿題を進めてください。</p>
    </div>
  );
}
