import { ClosedStage } from "@/components/ClosedStage";
import { STAGES, isStageOpen } from "@/lib/stages";
import { ExportButton } from "@/components/ExportButton";
import { requireCustomer } from "@/lib/session";
import { StepGuide } from "@/components/StepGuide";
import { NOT_READY } from "@/lib/stages";
export default async function Page() {
  const { company } = await requireCustomer();
  if (!isStageOpen(STAGES.find((x) => x.key === "deploy")!, company.status)) return <ClosedStage stageKey="deploy" status={company.status} />;
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">接点に展開する</h1>
      {/* 準備中のあいだは「場面を選ぶと下書きが出ます」などの案内を出さない（下の「準備中」と食い違うため） */}
      {!NOT_READY.has("deploy") && <StepGuide stageKey="deploy" />}
      <div className="mt-3"><ExportButton stageKey="deploy" /></div>
      <p className="mt-6 rounded-[var(--radius)] bg-paper-2 px-5 py-4 text-sm text-ink-2 max-w-[40em]">この段階の画面は、いま準備中です。できあがりしだい、この画面でご案内します。それまでは前の段階の見直しや、宿題を進めてください。</p>
    </div>
  );
}
