import Link from "next/link";
import type { Gate } from "@/lib/gates";

/**
 * 各ステップ画面の最下部に必ず置く「次へ」。
 * 進める：紺のボタン／自分で満たす条件が残っている：条件の文＋灰色ボタン／ベレネッツ側で開く：暖色で面談待ちと明記。
 */
export function NextStepBar({ gate }: { gate: Gate }) {
  const n = gate.next;
  return (
    <section className="mt-16 border-t hairline pt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
      <div className="min-w-[240px] flex-1">
        <p className="text-[11px] text-ink-3">次のステップ</p>
        {n ? (
          <p className="mt-0.5">
            <span className="num text-[10px] font-semibold tracking-[0.12em] text-navy mr-2">{n.step}</span>
            <span className="serif text-[17px]">{n.label}</span>
          </p>
        ) : (
          <p className="serif text-[17px] mt-0.5">最終ステップ</p>
        )}
        <p className={`text-[13px] mt-1 max-w-[56ch] ${gate.byOperator ? "text-warm" : "text-ink-2"}`}>{gate.note}</p>
      </div>
      {n && (
        gate.ready ? (
          <Link href={n.href} className="btn-primary">{n.label}へ進む →</Link>
        ) : (
          <span className="btn-primary opacity-40 cursor-not-allowed" aria-disabled="true">
            {gate.byOperator ? "面談のあとに開きます" : `${n.label}へ進む →`}
          </span>
        )
      )}
    </section>
  );
}
