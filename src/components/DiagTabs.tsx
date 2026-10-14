import Link from "next/link";

/** 適合診断の2画面（記録 ⇄ 結果を書く）を行き来するタブ。どちらのページにも同じものを置く */
export function DiagTabs({ companyId, current }: { companyId: string; current: "intake" | "diagnosis" }) {
  const tab = (key: "intake" | "diagnosis", label: string) => {
    const on = key === current;
    return on
      ? <span className="inline-block rounded-full bg-navy text-on-accent px-4 py-1.5 text-sm font-semibold">{label}</span>
      : <Link href={`/admin/${companyId}/${key}`} className="inline-block rounded-full border hairline px-4 py-1.5 text-sm text-ink-2 hover:text-ink hover:bg-paper-2">{label}</Link>;
  };
  return (
    <nav aria-label="適合診断" className="flex flex-wrap items-center gap-2">
      {tab("intake", "① 適合診断の記録（聞き取り・適合診断を始める）")}
      <span className="text-ink-3" aria-hidden>→</span>
      {tab("diagnosis", "② 適合診断の結果を書く（お客様に見せる）")}
    </nav>
  );
}
