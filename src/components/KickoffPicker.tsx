"use client";
import { useState } from "react";
import { fmtMeeting } from "@/lib/meetings";

/** キックオフ候補日：1回押して選び、「◯◯でよろしいですか？」の確認で「はい」を押して初めて決まる */
export function KickoffPicker({ dates, action, preview = false, label = "キックオフ", kind, declineAction }: { dates: string[]; action?: (formData: FormData) => void | Promise<void>; preview?: boolean; label?: string; kind?: string; declineAction?: (formData: FormData) => void | Promise<void> }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  return (
    <>
    {/* 日を選ぶ・別日を希望するのは担当者だけ。メンバーにはボタンの代わりに案内を出す（押しても何も起きないボタンを見せない） */}
    <p data-member-only className="mt-4 rounded-[var(--radius)] border hairline bg-paper px-4 py-3 text-[13px] text-ink-2">{label}の日程は、御社の担当者（主担当）が選びます。候補：{dates.map((d) => fmtMeeting(d)).join("／")}</p>
    <div data-admin-only>
      <div className="mt-4 flex flex-wrap gap-3">
        {dates.map((iso) => {
          const on = picked === iso;
          return (
            <button
              key={iso}
              type="button"
              disabled={preview}
              onClick={() => setPicked(on ? null : iso)}
              aria-pressed={on}
              className={`num rounded-[var(--radius)] border-2 px-5 py-2.5 text-sm font-semibold transition-colors ${on ? "border-navy bg-navy text-on-accent" : "border-navy text-navy bg-paper hover:bg-navy-soft"} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {fmtMeeting(iso)}
            </button>
          );
        })}
      </div>
      {declineAction && !picked && (
        <div className="mt-3">
          {!declining ? (
            <button type="button" disabled={preview} onClick={() => setDeclining(true)} className="text-[13px] text-ink-2 underline underline-offset-4 hover:text-ink disabled:opacity-60">すべての日程が難しい（別日を希望する）</button>
          ) : (
            <form data-admin-only action={preview ? undefined : declineAction} className="rounded-[var(--radius)] border-2 border-ink-3 bg-paper-2 px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              {kind && <input type="hidden" name="kind" value={kind} />}
              <p className="text-[15px]">{label}の候補日は、すべて難しいでしょうか？<span className="block text-[12px] text-ink-2 mt-0.5">「はい」を押すと今の候補は取り下げられ、ベレネッツから新しい候補日をお送りします。</span></p>
              <div className="flex items-center gap-3 ml-auto">
                <button type="button" className="btn-text" onClick={() => setDeclining(false)}>戻る</button>
                <button type="submit" className="btn-primary" disabled={preview}>はい、別日を希望する</button>
              </div>
            </form>
          )}
        </div>
      )}
      {picked && (
        <form data-admin-only action={preview ? undefined : action} className="mt-4 rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <input type="hidden" name="date" value={picked} />
          {kind && <input type="hidden" name="kind" value={kind} />}
          <p className="text-[15px]">{label}は <span className="num font-semibold">{fmtMeeting(picked)}</span> でよろしいですか？<span className="block text-[12px] text-ink-2 mt-0.5">「はい」を押すと決定し、ベレネッツに連絡が届きます。</span></p>
          <div className="flex items-center gap-3 ml-auto">
            <button type="button" className="btn-text" onClick={() => setPicked(null)}>選び直す</button>
            <button type="submit" className="btn-primary" disabled={preview}>はい、この日にする</button>
          </div>
        </form>
      )}
    </div>
    </>
  );
}
