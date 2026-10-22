"use client";
import { useState } from "react";
import { saveCounter, redraftCounter, restoreCounter } from "@/app/(app)/sheet/counter/actions";
import { decodeCounter } from "@/lib/history";
import { BRAKE_KINDS, EVIDENCE_TAG_LABEL } from "@/lib/brakes";
import { hasHole, HOLE_SPLIT } from "@/lib/counter";

export type CounterRow = { id: string; seq: number; value_raw: string | null; experience: string | null };
export type CounterBrake = {
  id: string; row_id: string; kind: string; customer_words: string | null;
  counter_message: string | null; because: string | null; because_tag: string; counter_by: string | null; counter_approved_at: string | null; counter_history: string[];
};

const tagCls: Record<string, string> = { fact: "tag-fact", verify: "tag-verify", hypothesis: "tag-hypo" };
const tagText: Record<string, string> = { fact: "text-fact", verify: "text-verify", hypothesis: "text-hypo" };
const OPT = "rounded-[var(--radius)] border px-3 py-1.5 text-[13px] font-medium transition-colors";

/** 穴（○・【要…】）を目立たせて表示する */
function WithHoles({ text }: { text: string }) {
  const parts = text.split(HOLE_SPLIT);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i} className="bg-warm-soft text-warm font-semibold px-0.5 rounded-sm">{p}</mark> : <span key={i}>{p}</span>))}</>;
}

/** 前に出た答え（履歴）から選んで戻す */
function HistoryPick({ b }: { b: CounterBrake }) {
  if (b.counter_history.length === 0) return null;
  return (
                            <details className="mt-3 text-[12px]">
                              <summary className="cursor-pointer text-navy font-semibold">前に出た答えから選ぶ（{b.counter_history.length}）</summary>
                              <ul className="mt-2 space-y-2">
                                {/* 新しい順に並べる（idx は保存されている並びの位置） */}
                                {b.counter_history.map((h, i) => ({ e: decodeCounter(h), i })).reverse().map(({ e, i }) => (
                                  <li key={i} className="rounded-[var(--radius)] border hairline bg-paper-2 px-3 py-2">
                                    <p className="text-[13px] text-ink leading-snug"><span className="text-[11px] text-ink-3 mr-1.5">⑤</span>{e.c}</p>
                                    {e.b && <p className="text-[12px] text-ink-2 leading-snug mt-0.5"><span className="text-[11px] text-ink-3 mr-1.5">⑥ なぜなら</span>{e.b}</p>}
                                    <form action={restoreCounter} className="mt-1.5">
                                      <input type="hidden" name="id" value={b.id} /><input type="hidden" name="idx" value={i} />
                                      <button className={OPT + " border-navy bg-paper text-navy hover:bg-navy-soft"} type="submit">この答えに戻す</button>
                                    </form>
                                  </li>
                                ))}
                              </ul>
                              <p className="text-[11px] text-ink-3 mt-1.5">戻すと、いまの答えはここ（前に出た答え）に移ります。最大5件まで残ります。</p>
                            </details>
  );
}

/** 組ごとに、ブレーキ1枚ずつ ⑤先回りの答え と ⑥なぜなら を並べる。直す／承認／AIに別案 */
export function CounterBoard({ rows, brakes }: { rows: CounterRow[]; brakes: CounterBrake[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const byRow = new Map<string, CounterBrake[]>();
  for (const b of brakes) { const l = byRow.get(b.row_id) ?? []; l.push(b); byRow.set(b.row_id, l); }
  const shown = rows.filter((r) => byRow.has(r.id));
  if (shown.length === 0) return <p className="text-sm text-ink-3">外すブレーキがまだありません。STEP 3 でお客様のブレーキを書き出してください。</p>;
  return (
    <ol className="space-y-8">
      {shown.map((r) => {
        const list = byRow.get(r.id)!;
        // 穴の残っていない答えだけを数える（見出しの数字と同じ判定）
        const facts = list.filter((b) => b.counter_message?.trim() && !hasHole(b.counter_message) && !hasHole(b.because) && b.because_tag === "fact").length;
        return (
          <li key={r.id} className="rounded-[var(--radius)] border hairline overflow-hidden">
            <div className="bg-paper-2 px-5 py-3 flex items-start gap-3">
              <span className="num text-xs text-ink-3 w-6 pt-1">{r.seq}</span>
              <div className="flex-1 min-w-0">
                <p className="serif text-[16px] leading-snug"><span className="text-[11px] text-ink-3 font-normal mr-1.5">御社は</span>{r.value_raw}</p>
                {r.experience && <p className="text-[13px] text-ink-2 mt-0.5"><span className="text-[11px] text-ink-3 mr-1.5">だから、お客様は</span>{r.experience}</p>}
              </div>
              {facts === 0
                ? <span className="text-[11px] font-semibold text-warm border border-warm rounded-full px-2 py-0.5 whitespace-nowrap" title="この組には、根拠が「事実」の答えがまだありません">事実 0件</span>
                : <span className="text-[11px] text-fact whitespace-nowrap pt-1">事実 {facts}件</span>}
            </div>
            <ul className="divide-y divide-hair">
              {list.map((b) => {
                const k = BRAKE_KINDS.find((x) => x.key === b.kind);
                const open = editing === b.id;
                const hole = hasHole(b.counter_message) || hasHole(b.because);
                const done = !!b.counter_message?.trim() && !hole;
                return (
                  <li key={b.id} className="px-5 py-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-3">{k?.label ?? b.kind}<span className="font-normal ml-1.5">{k?.one}</span></p>
                      <p className="text-[14px] leading-snug mt-1">「{b.customer_words}」</p>
                    </div>
                    <div className={`pl-3 tag-line ${b.counter_message ? tagCls[b.because_tag] ?? "tag-hypo" : "tag-none"}`}>
                      {open ? (
                        <form action={async (fd) => { await saveCounter(fd); setEditing(null); }} className="space-y-2">
                          <input type="hidden" name="id" value={b.id} /><input type="hidden" name="action" value="fix" />
                          <label className="block"><span className="text-[11px] text-ink-3">⑤ 先回りの答え</span>
                            <textarea name="counter" defaultValue={b.counter_message ?? ""} rows={3} required className="w-full border-b hairline py-1 text-[14px] bg-transparent" placeholder="お客様の言葉に、御社の言葉で答える（数字・条件・固有名詞を入れる）" /></label>
                          <label className="block"><span className="text-[11px] text-ink-3">⑥ なぜなら</span>
                            <textarea name="because" defaultValue={b.because ?? ""} rows={2} className="w-full border-b hairline py-1 text-[14px] bg-transparent" placeholder="その答えが本当だと言える根拠（手順・体制・数字・資格・保証・実績）" /></label>
                          <select name="tag" defaultValue={b.because_tag} className="border-b hairline py-1 text-[13px] bg-transparent">
                            <option value="fact">事実（確認済み）</option><option value="verify">要確認（数字・条件を確かめたい）</option><option value="hypothesis">仮説（根拠なし）</option>
                          </select>
                          <p className="text-[11px] text-ink-3">分からない数字・固有名詞は「○」のまま残してください。○ が残っている答えは、まだ完成扱いになりません。</p>
                          <div className="flex gap-2"><button className="btn-primary" type="submit">確定</button><button type="button" className="btn-text" onClick={() => setEditing(null)}>やめる</button></div>
                        </form>
                      ) : b.counter_message ? (
                        <>
                          <p className="text-[14px] leading-snug"><span className="text-[11px] text-ink-3 mr-1.5">⑤</span><WithHoles text={b.counter_message} /></p>
                          <p className="text-[13px] text-ink-2 leading-snug mt-1"><span className="text-[11px] text-ink-3 mr-1.5">⑥ なぜなら</span>{b.because ? <WithHoles text={b.because} /> : <span className="text-warm">（根拠が空です）</span>}</p>
                          <p className="text-[11px] mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span className={tagText[b.because_tag] ?? "text-hypo"}>{EVIDENCE_TAG_LABEL[b.because_tag] ?? b.because_tag}</span>
                            {hole && <span className="text-warm font-semibold">○ の穴があります（埋めると完成）</span>}
                            {b.counter_approved_at && done ? <span className="text-navy">承認済</span> : b.counter_by === "ai" ? <span className="text-ink-3">AIの下書き</span> : null}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {!b.counter_approved_at && <form action={saveCounter}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="action" value="approve" /><button className={OPT + " border-navy bg-navy text-on-accent font-semibold hover:brightness-110"} type="submit">このままでよい</button></form>}
                            <button type="button" className={OPT + " border-navy bg-paper text-navy hover:bg-navy-soft"} onClick={() => setEditing(b.id)}>{hole ? "穴を埋める・直す" : "直す"}</button>
                            <form action={redraftCounter} data-busy-timeout="90000"><input type="hidden" name="id" value={b.id} /><button className={OPT + " border-navy bg-paper text-navy hover:bg-navy-soft"} type="submit">AIに別の答えを頼む</button></form>
                            {b.counter_approved_at && <form action={saveCounter}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="action" value="reopen" /><button className="btn-text text-xs" type="submit">承認を外す</button></form>}
                          </div>
                          <HistoryPick b={b} />
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => setEditing(b.id)} className="text-[14px] text-warm hover:underline underline-offset-4 text-left">それなら…？　← 先回りの答えを書く</button>
                          <HistoryPick b={b} />
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
