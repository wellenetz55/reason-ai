import Link from "next/link";
import { STAGES } from "@/lib/stages";
import { StepGuide } from "@/components/StepGuide";

/** まだ開いていない段階に直接アクセスしたときの画面（説明は見せる。操作はさせない） */
export function ClosedStage({ stageKey, status }: { stageKey: string; status: string }) {
  const s = STAGES.find((x) => x.key === stageKey);
  if (!s) return null;
  const byOperator = ["step0", "merge", "litmus"].includes(stageKey) || ["onboarding", "diagnosed"].includes(status);
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">{s.label}</h1>
      <StepGuide stageKey={stageKey} />
      <section className="mt-10 rounded-[var(--radius)] bg-warm-soft px-6 py-5 max-w-[64ch]">
        <p className="font-semibold text-warm">この段階はまだ開いていません</p>
        <p className="text-sm text-ink-2 mt-1 leading-relaxed">
          {byOperator ? "前の段階をベレネッツとの面談で確認したあとに開きます。" : "前の段階を進めると開きます。"}
          ホームの「いま進めること」から続けてください。
        </p>
        <Link href="/" className="btn-primary inline-block mt-4">ホームへ</Link>
      </section>
    </div>
  );
}
