import { STAGES } from "@/lib/stages";

/**
 * 各段階の画面に必ず出す、平易な説明ボックス（ELI5）。
 * 淡い紺の背景で目立たせる。方針: 白紙を見せない／何をする段階かを子どもにもわかる言葉で。
 */
export function StepGuide({ stageKey }: { stageKey: string }) {
  const s = STAGES.find((x) => x.key === stageKey);
  if (!s) return null;
  return (
    <aside className="mt-6 rounded-[var(--radius)] bg-navy-soft px-6 py-5 max-w-[72ch]">
      <p className="num text-[10px] font-semibold tracking-[0.12em] text-navy">{s.step} · この段階でやること</p>
      <p className="serif text-[17px] leading-snug mt-2 text-ink">{s.guide.lead}</p>
      <p className="text-sm text-ink-2 leading-relaxed mt-2">{s.guide.body}</p>
      {s.guide.items && (
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {s.guide.items.map((it) => (
            <div key={it.name} className="rounded-[var(--radius)] bg-paper/70 px-4 py-3">
              <dt className="serif text-[15px] text-navy">{it.name}</dt>
              <dd className="text-[13px] text-ink-2 leading-relaxed mt-0.5">{it.body}</dd>
              <dd className="text-[13px] text-ink mt-1">例：{it.example}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
