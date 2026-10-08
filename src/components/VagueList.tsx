"use client";
import { useState } from "react";
import { findVague, hasConcrete } from "@/lib/vague";
import { resolveDiagnosis } from "@/app/(app)/sheet/merge/actions";

type Row = { id: string; seq: number; value_raw: string | null; experience_value_v1: string | null };
type Diag = { row_id: string; vague_score: number; issues: string[]; suggestion_value: string | null; suggestion_experience: string | null; resolved: string | null; checked_at: string };

function Mark({ text }: { text: string | null }) {
  if (!text) return null;
  const words = findVague(text);
  if (words.length === 0) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return <>{text.split(re).map((p, i) => (words.includes(p) ? <mark key={i} className="bg-hypo/20 text-ink rounded-sm px-0.5">{p}</mark> : <span key={i}>{p}</span>))}</>;
}

/** ふわっと診断の一覧。辞書の印は即時、AIの点検は checked があるときだけ */
export function VagueList({ rows, diags }: { rows: Row[]; diags: Diag[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const dmap = new Map(diags.map((d) => [d.row_id, d]));
  const flagged = rows.map((r) => {
    const d = dmap.get(r.id);
    const dict = [...findVague(r.value_raw), ...findVague(r.experience_value_v1)];
    const concrete = hasConcrete(r.value_raw);
    const score = d && d.resolved !== "accepted" ? d.vague_score : 0;
    return { r, d, dict, concrete, score, show: (dict.length > 0 || score >= 1 || !concrete) && d?.resolved !== "kept" && d?.resolved !== "accepted" };
  }).filter((x) => x.show).sort((a, b) => b.score - a.score || b.dict.length - a.dict.length);

  if (flagged.length === 0) return <p className="text-sm text-ink-2 mt-3">印のつく組はありません。</p>;
  return (
    <ol className="mt-4 divide-y hairline">
      {flagged.map(({ r, d, dict, concrete, score }) => (
        <li key={r.id} className="py-4 pl-4 tag-line tag-hypo">
          <div className="flex items-start gap-4">
            <span className="num text-xs text-ink-3 w-6 pt-1">{r.seq}</span>
            <div className="flex-1 min-w-0">
              <p className="serif text-[16px] leading-snug"><span className="text-[11px] text-ink-3 font-normal mr-1.5">御社は</span><Mark text={r.value_raw} /></p>
              {r.experience_value_v1 && <p className="text-[15px] leading-snug mt-0.5"><span className="text-[11px] text-ink-3 mr-1.5">だから、お客様は</span><Mark text={r.experience_value_v1} /></p>}
              <p className="text-[12px] text-ink-3 mt-1.5 flex flex-wrap gap-x-3">
                {dict.length > 0 && <span>どの会社でも言える語：{[...new Set(dict)].join("・")}</span>}
                {!concrete && <span>数字・固有名詞がない</span>}
                {d && d.resolved !== "accepted" && d.issues.map((i, k) => <span key={k}>AI：{i}</span>)}
                {score > 0 && <span className="text-hypo">ふわっと度 {score}/3</span>}
              </p>
              {d?.suggestion_value && d.resolved == null && (
                editing === r.id ? (
                  <form action={async (fd) => { await resolveDiagnosis(fd); setEditing(null); }} className="mt-3 rounded-[var(--radius)] bg-navy-soft px-4 py-3">
                    <input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="accept" />
                    <label className="block text-[11px] text-navy">言い直し案（直してから採用できます）</label>
                    <textarea name="after" defaultValue={d.suggestion_value} rows={2} className="w-full border-b hairline py-1 text-sm bg-transparent" />
                    <textarea name="after_experience" defaultValue={d.suggestion_experience ?? r.experience_value_v1 ?? ""} rows={2} className="w-full border-b hairline py-1 text-sm mt-2 bg-transparent" placeholder="だから、お客様は…" />
                    <div className="mt-2 flex gap-2"><button className="btn-primary" type="submit">この内容で直す</button><button type="button" className="btn-text" onClick={() => setEditing(null)}>やめる</button></div>
                  </form>
                ) : (
                  <div className="mt-3 rounded-[var(--radius)] bg-navy-soft px-4 py-3">
                    <p className="text-[11px] text-navy">AIの言い直し案</p>
                    <p className="text-sm mt-1">{d.suggestion_value}</p>
                    {d.suggestion_experience && <p className="text-sm text-ink-2 mt-0.5">だから、お客様は {d.suggestion_experience}</p>}
                    <div className="mt-2 flex gap-1">
                      <button type="button" className="btn-text text-navy" onClick={() => setEditing(r.id)}>この案で直す</button>
                      <form action={resolveDiagnosis}><input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="keep" /><button className="btn-text" type="submit">そのままでよい</button></form>
                      <form action={resolveDiagnosis}><input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="hold" /><button className="btn-text" type="submit">保留にする</button></form>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
