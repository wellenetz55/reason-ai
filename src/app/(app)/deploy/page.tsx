import { StepGuide } from "@/components/StepGuide";
export default function Page() {
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">接点に展開する</h1>
      <StepGuide stageKey="deploy" />
      <p className="text-ink-2 text-sm mt-2">この段階はまだ準備中です。先に「提供価値を出す」を進めてください。</p>
    </div>
  );
}
