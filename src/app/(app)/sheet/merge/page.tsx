import { StepGuide } from "@/components/StepGuide";
export default function Page() {
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">まとめて絞る</h1>
      <StepGuide stageKey="merge" />
      <p className="text-ink-2 text-sm mt-2">この段階はまだ準備中です。先に「提供価値を出す」を進めてください。</p>
    </div>
  );
}
