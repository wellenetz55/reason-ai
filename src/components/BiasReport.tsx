import Link from "next/link";
import { FACETS } from "@/lib/facets";

type Row = { facet: string | null; target: string | null; value_raw: string | null; experience_value_v1: string | null };

/**
 * 偏り診断（AI不要）。7つの面・機能/情緒・誰向け・重複を集計し、一文で指摘する。
 * 情緒側の判定は「面が情緒的側面」または体験価値に気持ちの語があるか、の簡易ルール。
 */
export function BiasReport({ rows }: { rows: Row[] }) {
  const n = rows.length;
  if (n === 0) return null;
  const byFacet = FACETS.map((f) => ({ ...f, n: rows.filter((r) => r.facet === f.key).length }));
  const top = [...byFacet].sort((a, b) => b.n - a.n)[0];
  const empty = byFacet.filter((f) => f.n === 0);
  const thin = byFacet.filter((f) => f.n > 0 && f.n / n < 0.08);
  const emo = rows.filter((r) => r.facet === "emotional" || /安心|嬉し|誇り|楽し|ほっと|解放|自信|ワクワク|気持ち|不安が|ストレス|負担が/.test(r.experience_value_v1 ?? "")).length;
  const targets = new Map<string, number>();
  rows.forEach((r) => { const t = (r.target ?? "").trim(); targets.set(t, (targets.get(t) ?? 0) + 1); });
  const noTarget = targets.get("") ?? 0;
  const dup = (() => {
    const seen = new Map<string, number>();
    rows.forEach((r) => { const k = (r.value_raw ?? "").replace(/\s/g, ""); if (k) seen.set(k, (seen.get(k) ?? 0) + 1); });
    return [...seen.values()].filter((c) => c > 1).length;
  })();

  const lines: { text: string; href?: string; warn: boolean }[] = [];
  if (top.n / n >= 0.5) lines.push({ text: `「${top.label}」に${Math.round((top.n / n) * 100)}%が集中しています。`, warn: true });
  else lines.push({ text: `面の偏りは大きくありません（最多は「${top.label}」${Math.round((top.n / n) * 100)}%）。`, warn: false });
  if (empty.length) lines.push({ text: `まだ0組の面：${empty.map((f) => f.label).join("・")}。`, href: "/sheet/diverge", warn: true });
  if (thin.length) lines.push({ text: `薄い面：${thin.map((f) => `${f.label}（${f.n}）`).join("・")}。`, href: "/sheet/diverge", warn: true });
  lines.push({ text: `機能寄り ${n - emo}組／情緒寄り ${emo}組。${emo / n < 0.25 ? "お客様の気持ちの変化を書いた組が少なめです。" : ""}`, warn: emo / n < 0.25 });
  if (noTarget / n > 0.6) lines.push({ text: `「誰向け」が空の組が${noTarget}組。相手を決めると言葉が具体的になります。`, warn: true });
  if (dup) lines.push({ text: `同じ提供価値の組が${dup}通りあります（体験価値違い）。統合のときに束ねます。`, warn: false });

  return (
    <section>
      <h2 className="serif text-[20px]">偏り診断</h2>
      <div className="mt-3 flex gap-3 items-end">
        {byFacet.map((f) => (
          <div key={f.key} className="flex flex-col items-center w-12" title={`${f.label} ${f.n}組`}>
            <span className="num text-[11px] text-ink-2">{f.n}</span>
            <div className="w-2.5 bg-hair rounded-sm overflow-hidden flex items-end" style={{ height: 40 }}>
              <div className={f.n ? "w-full bg-navy" : "w-full"} style={{ height: `${Math.round((f.n / Math.max(...byFacet.map((x) => x.n), 1)) * 100)}%` }} />
            </div>
            <span className={`text-[10px] text-center leading-tight mt-1 ${f.n === 0 ? "text-warm" : "text-ink-3"}`}>{f.short}</span>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5 text-sm max-w-[64ch]">
        {lines.map((l, i) => (
          <li key={i} className={l.warn ? "text-ink" : "text-ink-2"}>
            {l.warn && <span className="inline-block w-1.5 h-1.5 rounded-full bg-warm mr-2 align-middle" />}
            {l.text}
            {l.href && <Link href={l.href} className="ml-2 text-navy underline underline-offset-4">その面の問いに戻る</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}
