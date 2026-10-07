export function FacetBars({ facets }: { facets: { key: string; label: string; n: number }[] }) {
  const max = Math.max(5, ...facets.map((f) => f.n));
  return (
    <div className="mt-3 flex gap-2 items-end justify-end" aria-label="面ごとの行数">
      {facets.map((f) => (
        <div key={f.key} className="flex flex-col items-center gap-1" title={`${f.label} ${f.n}行`}>
          <div className="w-1.5 bg-hair rounded-sm overflow-hidden flex items-end" style={{ height: 28 }}>
            <div className="w-full bg-navy" style={{ height: `${Math.round((f.n / max) * 100)}%` }} />
          </div>
          <span className="text-[10px] text-ink-3 num">{f.n}</span>
        </div>
      ))}
    </div>
  );
}
