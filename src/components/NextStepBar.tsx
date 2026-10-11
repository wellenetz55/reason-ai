import Link from "next/link";
import type { Gate } from "@/lib/gates";
import { NOT_READY } from "@/lib/stages";

/**
 * 各ステップ画面の最下部に必ず置く「次へ」。
 * 進める：紺のボタン／自分で満たす条件が残っている：条件の文＋灰色ボタン／ベレネッツ側で開く：暖色で面談待ちと明記。
 */
export function NextStepBar({ gate }: { gate: Gate }) {
  const n = gate.next;
  const notReady = !!n && NOT_READY.has(n.key);
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
        <p className={`text-[13px] mt-1 max-w-[56ch] ${gate.byOperator || notReady ? "text-warm" : "text-ink-2"}`}>{notReady ? "次の段階の画面は準備中です。進め方は次の面談でご案内します。" : gate.note}</p>
      </div>
      {n && (
        notReady ? (
          <span className="btn-primary opacity-40 cursor-not-allowed" aria-disabled="true">準備中（面談でご案内）</span>
        ) : gate.ready ? (
          <Link href={n.href} className="btn-primary">次へ：{n.label} →</Link>
        ) : (
          <span className="btn-primary opacity-40 cursor-not-allowed" aria-disabled="true">
            {gate.byOperator ? "面談のあとに開きます" : `次へ：${n.label} →`}
          </span>
        )
      )}
    </section>
  );
}
