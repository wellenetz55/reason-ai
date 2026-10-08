"use client";
import { useState } from "react";

/**
 * 7つの面ごとの行数。STEP 1 で「どの角度がまだ薄いか」を見せる。
 * 「？」を押すと、このグラフの読み方が淡い色のボックスで出る。
 */
export function FacetBars({ facets }: { facets: { key: string; label: string; short: string; n: number }[] }) {
  const [open, setOpen] = useState(false);
  const max = Math.max(5, ...facets.map((f) => f.n));
  const empty = facets.filter((f) => f.n === 0).map((f) => f.label);
  return (
    <div className="mt-3 relative" aria-label="7つの面ごとの行数">
      <p className="text-[11px] text-ink-3 text-right flex items-center justify-end gap-1.5">
        7つの面ごとの行数
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="このグラフの読み方"
          className="num w-4 h-4 rounded-full border border-ink-3 text-[10px] leading-none text-ink-3 hover:border-navy hover:text-navy"
        >
          ?
        </button>
      </p>
      <div className="mt-1.5 flex gap-2.5 items-end justify-end">
        {facets.map((f) => (
          <div key={f.key} className="flex flex-col items-center gap-1 w-8" title={`${f.label} ${f.n}行`}>
            <span className="text-[11px] num text-ink-2">{f.n}</span>
            <div className="w-2 bg-hair rounded-sm overflow-hidden flex items-end" style={{ height: 28 }}>
              <div className={`w-full ${f.n === 0 ? "bg-transparent" : "bg-navy"}`} style={{ height: `${Math.round((f.n / max) * 100)}%` }} />
            </div>
            <span className={`text-[10px] leading-tight text-center ${f.n === 0 ? "text-warm" : "text-ink-3"}`}>{f.short}</span>
          </div>
        ))}
      </div>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-10 w-[340px] rounded-[var(--radius)] bg-navy-soft px-5 py-4 text-left shadow-sm">
          <p className="serif text-[14px] leading-snug">このグラフの読み方</p>
          <p className="text-[13px] text-ink-2 leading-relaxed mt-2">
            提供価値は、7つの「面」（問いの角度）から順番に書き出します。棒は、面ごとにいま何行出ているかです。
            同じ角度に偏らないように、いちばん薄い面から次の問いが出ます。
          </p>
          <ul className="text-[12px] text-ink-2 leading-relaxed mt-2 space-y-0.5">
            {facets.map((f) => (
              <li key={f.key}><span className="text-ink">{f.short}</span>＝{f.label}</li>
            ))}
          </ul>
          {empty.length > 0 && (
            <p className="text-[12px] text-warm mt-2">まだ0行の面：{empty.join("、")}</p>
          )}
          <button type="button" onClick={() => setOpen(false)} className="btn-text mt-3 -ml-1.5">閉じる</button>
        </div>
      )}
    </div>
  );
}
