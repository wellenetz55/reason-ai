import { NextStepBar } from "@/components/NextStepBar";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { StepGuide } from "@/components/StepGuide";
export default async function Page() {
  const { supabase, company } = await requireCustomer();
  const gate = stepGate("counter", await loadGateCtx(supabase, company.id, company.status));
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">ブレーキを外す</h1>
      <StepGuide stageKey="counter" />
      <p className="text-ink-2 text-sm mt-2">この段階はまだ準備中です。先に「提供価値を出す」を進めてください。</p>
      <NextStepBar gate={gate} />
    </div>
  );
}
