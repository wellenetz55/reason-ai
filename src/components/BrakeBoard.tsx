"use client";
import { useState } from "react";
import { SealReason, SealBadge } from "@/components/SealReason";
import { saveBrake, addBrake } from "@/app/(app)/sheet/brakes/actions";
import { BRAKE_KINDS, BRAKE_SOURCES, BRAKE_SOURCE_LABEL, EVIDENCE_TAG_LABEL } from "@/lib/brakes";

export type BrakeRow = { id: string; seq: number; value_raw: string | null; experience: string | null };
export type Brake = { id: string; row_id: string; kind: string; customer_words: string | null; source_tag: string | null; evidence_tag: string; status: string; created_by: string; approved_at: string | null; sealed?: string | null };

const tagCls: Record<string, string> = { fact: "tag-fact", verify: "tag-verify", hypothesis: "tag-hypo" };
const tagText: Record<string, string> = { fact: "text-fact", verify: "text-verify", hypothesis: "text-hypo" };

function Fields({ words, source, tag }: { words?: string; source?: string; tag?: string }) {
  return (
    <>
      <textarea name="words" defaultValue={words ?? ""} rows={2} required placeholder="お客様の心の声（例：本当にうちの規模でも同じ結果が出るのか）" className="w-full border-b hairline py-1 text-[14px] bg-transparent" />
      <div className="flex flex-wrap gap-3 items-center text-[12px] mt-2">
        <select name="source" defaultValue={source ?? "own"} className="border-b hairline py-1 bg-transparent">
          {BRAKE_SOURCES.filter((s) => s.key !== "ai").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select name="tag" defaultValue={tag ?? "hypothesis"} className="border-b hairline py-1 bg-transparent">
          <option value="fact">事実（実際に言われた）</option><option value="verify">要確認</option><option value="hypothesis">仮説</option>
        </select>
      </div>
    </>
  );
}

/** 組ごとに 不信／不要／不適／不急 のカードを並べる。直す／承認／外す／自分で追加 */
export function BrakeBoard({ rows, brakes }: { rows: BrakeRow[]; brakes: Brake[] }) {
  const [editing, setEditing] = useState<string | null>(null); // brake id
  const [adding, setAdding] = useState<string | null>(null); // `${rowId}:${kind}`
  const byRow = new Map<string, Brake[]>();
  for (const b of brakes) { const l = byRow.get(b.row_id) ?? []; l.push(b); byRow.set(b.row_id, l); }
  if (rows.length === 0) return <p className="text-sm text-ink-3">まだ組がありません。STEP 1・2 で提供価値・体験価値の組を残してください。</p>;
  return (
    <ol className="space-y-8">
      {rows.map((r) => {
        const list = byRow.get(r.id) ?? [];
        const active = list.filter((b) => b.status === "active");
        const dropped = list.filter((b) => b.status !== "active");
        return (
          <li key={r.id} className="rounded-[var(--radius)] border hairline overflow-hidden">
            <div className="bg-paper-2 px-5 py-3 flex items-start gap-3">
              <span className="num text-xs text-ink-3 w-6 pt-1">{r.seq}</span>
              <div className="flex-1 min-w-0">
                <p className="serif text-[16px] leading-snug"><span className="text-[11px] text-ink-3 font-normal mr-1.5">御社は</span>{r.value_raw}</p>
                {r.experience && <p className="text-[13px] text-ink-2 mt-0.5"><span className="text-[11px] text-ink-3 mr-1.5">だから、お客様は</span>{r.experience}</p>}
              </div>
              <span className="text-[11px] text-ink-3 whitespace-nowrap pt-1">{active.length === 0 ? "ブレーキなし" : `${new Set(active.map((b) => b.kind)).size}/4 種類`}</span>
            </div>
            <div className="grid gap-px bg-hair md:grid-cols-2 xl:grid-cols-4">
              {BRAKE_KINDS.map((k) => {
                const items = active.filter((b) => b.kind === k.key);
                const addKey = `${r.id}:${k.key}`;
                return (
                  <div key={k.key} className="bg-paper px-4 py-3 min-h-[120px] flex flex-col">
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-3">{k.label}<span className="font-normal ml-1.5 text-ink-3">{k.one}</span></p>
                    <div className="mt-2 space-y-3 flex-1">
                      {items.map((b) => {
                        const open = editing === b.id;
                        const ok = !!b.approved_at;
                        return (
                          <div key={b.id} className={`pl-3 tag-line ${tagCls[b.evidence_tag] ?? "tag-hypo"}`}>
                            {open ? (
                              <form action={async (fd) => { await saveBrake(fd); setEditing(null); }}>
                                <input type="hidden" name="id" value={b.id} /><input type="hidden" name="action" value="fix" />
                                <Fields words={b.customer_words ?? ""} source={b.source_tag === "ai" ? "own" : b.source_tag ?? "own"} tag={b.evidence_tag} />
                                {b.sealed && <SealReason />}<div className="flex gap-2 mt-2"><button className="btn-primary" type="submit">確定</button><button type="button" className="btn-text" onClick={() => setEditing(null)}>やめる</button></div>
                              </form>
                            ) : (
                              <>
                                <p className="text-[14px] leading-snug">「{b.customer_words}」</p>
                                <p className="text-[11px] mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                                  <span className={tagText[b.evidence_tag] ?? "text-hypo"}>{EVIDENCE_TAG_LABEL[b.evidence_tag] ?? b.evidence_tag}</span>
                                  <span className="text-ink-3">{BRAKE_SOURCE_LABEL[b.source_tag ?? ""] ?? "出所なし"}</span>
                                  {ok ? <span className="text-navy">承認済</span> : b.created_by === "ai" ? <span className="text-ink-3">AIの下書き</span> : null}
                                  {b.sealed && <SealBadge label={b.sealed} />}
                                </p>
                                <div className="flex flex-wrap gap-x-3 mt-1">
                                  <button type="button" className="btn-text text-xs" onClick={() => setEditing(b.id)}>直す</button>
                                  {!ok && <form action={saveBrake}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="action" value="approve" /><button className="btn-text text-xs" type="submit">承認</button></form>}
                                  {!b.sealed && <form action={saveBrake}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="action" value="drop" /><button className="btn-text text-xs text-ink-3" type="submit">外す</button></form>}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                      {adding === addKey ? (
                        <form action={async (fd) => { await addBrake(fd); setAdding(null); }} className="pl-3 border-l-2 border-dashed border-ink-3">
                          <input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="kind" value={k.key} />
                          <Fields />
                          <div className="flex gap-2 mt-2"><button className="btn-primary" type="submit">追加</button><button type="button" className="btn-text" onClick={() => setAdding(null)}>やめる</button></div>
                        </form>
                      ) : (
                        <button type="button" className="text-[12px] text-ink-3 hover:text-ink underline underline-offset-4" onClick={() => setAdding(addKey)}>＋ 自分で書く</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {dropped.length > 0 && (
              <details className="px-5 py-2 text-[12px] text-ink-3 bg-paper-2 border-t hairline">
                <summary className="cursor-pointer">外したブレーキ（{dropped.length}）</summary>
                <ul className="mt-1 space-y-1">
                  {dropped.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-x-3">
                      <span className="line-through">{BRAKE_KINDS.find((k) => k.key === b.kind)?.label}：{b.customer_words}</span>
                      <form action={saveBrake}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="action" value="restore" /><button className="btn-text text-xs" type="submit">戻す</button></form>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
