"use client";
import { useState } from "react";
import { fmtMeeting } from "@/lib/meetings";

/** キックオフ候補日：1回押して選び、「◯◯でよろしいですか？」の確認で「はい」を押して初めて決まる */
export function KickoffPicker({ dates, action, preview = false }: { dates: string[]; action?: (formData: FormData) => void | Promise<void>; preview?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div>
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
      {picked && (
        <form action={preview ? undefined : action} className="mt-4 rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          <input type="hidden" name="date" value={picked} />
          <p className="text-[15px]">キックオフは <span className="num font-semibold">{fmtMeeting(picked)}</span> でよろしいですか？<span className="block text-[12px] text-ink-2 mt-0.5">「はい」を押すと決定し、ベレネッツに連絡が届きます。</span></p>
          <div className="flex items-center gap-3 ml-auto">
            <button type="button" className="btn-text" onClick={() => setPicked(null)}>選び直す</button>
            <button type="submit" className="btn-primary" disabled={preview}>はい、この日にする</button>
          </div>
        </form>
      )}
    </div>
  );
}
