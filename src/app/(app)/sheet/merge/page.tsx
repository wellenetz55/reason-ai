import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { StepGuide } from "@/components/StepGuide";
export default async function Page() {
  const { supabase, company } = await requireCustomer();
  const gate = stepGate("merge", await loadGateCtx(supabase, company.id, company.status));
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">まとめて絞る</h1>
      <StepGuide stageKey="merge" />
      <div className="mt-3"><ExportButton stageKey="merge" /></div>
      <p className="text-ink-2 text-sm mt-2">この段階はまだ準備中です。先に「提供価値を出す」を進めてください。</p>
      <NextStepBar gate={gate} />
    </div>
  );
}
