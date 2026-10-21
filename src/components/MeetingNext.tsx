import { fmtMeeting } from "@/lib/meetings";
import type { MeetingNext as M } from "@/server/meetingNext";

/**
 * ステップの出口に置く「次はベレネッツとの面談」の案内。
 * done=true（このステップの作業が一通り終わった）なら暖色で強く、そうでなければ控えめに。
 */
export function MeetingNextBlock({ m, done, before }: { m: M; done: boolean; before: string }) {
  if (m.held) return null;
  return (
    <section className={`mt-14 rounded-md border px-6 py-6 ${done ? "border-warm bg-warm-soft" : "hairline bg-paper-2"}`}>
      <p className="text-[11px] tracking-[0.12em] font-semibold text-warm">次は、ベレネッツとの面談</p>
      <h2 className="serif text-[24px] leading-tight mt-1">{m.label}</h2>
      <p className="text-[14px] text-ink-2 mt-3 max-w-[44em]">
        {done ? `${before}は、ここまでです。` : `${before}が終わると、次は${m.label}です。`}
        絞った言葉を、ベレネッツと画面を見ながら一緒に確認します。この面談のあと、ベレネッツが次のステップを開きます。
      </p>
      <div className="mt-4 rounded-md bg-paper border hairline px-4 py-3 text-[14px]">
        {m.at ? (
          <p>
            <span className="text-[11px] text-ink-3 mr-3">日程</span>
            <span className="num font-semibold">{fmtMeeting(m.at)}</span>
            {m.url && <a href={m.url} target="_blank" rel="noreferrer" className="ml-4 underline text-navy">会議に参加する</a>}
          </p>
        ) : (
          <p><span className="text-[11px] text-ink-3 mr-3">日程</span>ベレネッツから日程のご連絡をしますので、お待ちください。</p>
        )}
      </div>
      {done && <p className="text-[12px] text-ink-3 mt-3">面談までの間も、STEP 1・STEP 2 に戻って組を足したり磨き直したりして構いません。</p>}
    </section>
  );
}
