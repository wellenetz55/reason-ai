import Link from "next/link";
import { STAGES } from "@/lib/stages";
import { StepGuide } from "@/components/StepGuide";

/** まだ開いていない段階に直接アクセスしたときの画面（説明は見せる。操作はさせない） */
export function ClosedStage({ stageKey, status }: { stageKey: string; status: string }) {
  const s = STAGES.find((x) => x.key === stageKey);
  if (!s) return null;
  const byOperator = ["step0", "merge", "litmus"].includes(stageKey) || ["onboarding", "diagnosed"].includes(status);
  if (status === "locked" || status === "cancelled") {
    return (
      <div>
        <h1 className="serif text-[28px] leading-tight">{s.label}</h1>
        <section className="mt-10 rounded-[var(--radius)] bg-paper-2 px-6 py-5 max-w-[64ch]">
          <p className="font-semibold">{status === "locked" ? "編集できる期間は終わりました" : "ご契約は終了しています"}</p>
          <p className="text-sm text-ink-2 mt-1 leading-relaxed">
            {status === "locked"
              ? "これまでに作った提供価値シートは、Excelでダウンロードできます。続けて使いたい場合は、ベレネッツにお問い合わせください。"
              : "シートの内容が必要な場合は、ベレネッツにご連絡ください。確認のうえ、一定の期間、提供価値シートをダウンロードできるようにします。"}
          </p>
          {status === "locked" && <a href="/api/export?step=deploy" className="btn-primary inline-block mt-4">提供価値シートをダウンロード</a>}
        </section>
      </div>
    );
  }
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
