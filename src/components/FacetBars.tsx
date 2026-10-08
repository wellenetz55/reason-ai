/**
 * 7つの面ごとの行数。STEP 1 で「どの角度がまだ薄いか」を見せる。
 * 短い面名を棒の下に出し、ホバーで正式名と行数。
 */
export function FacetBars({ facets }: { facets: { key: string; label: string; short: string; n: number }[] }) {
  const max = Math.max(5, ...facets.map((f) => f.n));
  return (
    <div className="mt-3" aria-label="7つの面ごとの行数">
      <p className="text-[11px] text-ink-3 text-right">7つの面ごとの行数</p>
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
    </div>
  );
}
