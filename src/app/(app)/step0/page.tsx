import { StepGuide } from "@/components/StepGuide";
export default function Page() {
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">会社を知る</h1>
      <StepGuide stageKey="step0" />
      <p className="text-ink-2 text-sm mt-2">この段階はまだ準備中です。先に「提供価値を出す」を進めてください。</p>
    </div>
  );
}
