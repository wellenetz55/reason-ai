"use client";
import { useState } from "react";
import { saveTriple } from "@/app/(app)/sheet/trust/actions";
import { BECAUSE_TYPES } from "@/lib/because";

type Row = {
  id: string; seq: number; value_raw: string | null; experience_value_v1: string | null; experience_value: string | null;
  because_phrase: string | null; because_tag: string | null; because_only_us: boolean; because_by: string | null; trust_axis: string | null;
};
const TAG: Record<string, string> = { fact: "事実", verify: "要確認", hypothesis: "仮説" };
const tagCls: Record<string, string> = { fact: "tag-fact", verify: "tag-verify", hypothesis: "tag-hypo" };

/** 三連（提供価値／体験価値／なぜなら）の一覧と編集 */
export function TripleList({ rows }: { rows: Row[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (rows.length === 0) return <p className="text-sm text-ink-3">まだ組がありません。STEP 1 で提供価値・体験価値を出してください。</p>;
  return (
    <ol className="divide-y hairline">
      {rows.map((r) => {
        const exp = r.experience_value ?? r.experience_value_v1;
        const hasB = !!r.because_phrase;
        const aiB = hasB && r.because_by === "ai";
        const open = editing === r.id;
        return (
          <li key={r.id} className={`py-5 pl-4 tag-line ${hasB ? tagCls[r.because_tag ?? "hypothesis"] : "tag-none"}`}>
            <div className="flex items-start gap-4">
              <span className="num text-xs text-ink-3 w-6 pt-1.5">{r.seq}</span>
              <div className="flex-1 min-w-0">
                <p className="serif text-[17px] leading-snug"><span className="text-[11px] text-ink-3 font-normal mr-1.5">御社は</span>{r.value_raw}</p>
                {open ? (
                  <form action={async (fd) => { await saveTriple(fd); setEditing(null); }} className="mt-3 space-y-3">
                    <input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="fix" />
                    <label className="block"><span className="text-[11px] text-ink-3">だから、お客様は</span>
                      <textarea name="experience" defaultValue={exp ?? ""} rows={2} placeholder="〜と感じることができる" className="w-full border-b hairline py-1 text-[15px]" /></label>
                    <label className="block"><span className="text-[11px] text-ink-3">なぜなら</span>
                      <textarea name="because" defaultValue={r.because_phrase ?? ""} rows={2} placeholder="〜だから（プロセス・数字・資格・体制・保証など、御社がどうやってそれを実現するか）" className="w-full border-b hairline py-1 text-[15px]" /></label>
                    <div className="flex flex-wrap gap-4 items-center text-[13px]">
                      <select name="type" defaultValue={r.trust_axis ?? ""} className="border-b hairline py-1">
                        <option value="">根拠の種類</option>
                        {BECAUSE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                      <select name="tag" defaultValue={r.because_tag ?? "hypothesis"} className="border-b hairline py-1">
                        <option value="fact">事実</option><option value="verify">要確認</option><option value="hypothesis">仮説</option>
                      </select>
                      <label className="flex items-center gap-1.5"><input type="checkbox" name="only_us" value="1" defaultChecked={r.because_only_us} />「当社しかありません」と言える</label>
                    </div>
                    <div className="flex gap-2"><button className="btn-primary" type="submit">確定</button><button type="button" className="btn-text" onClick={() => setEditing(null)}>やめる</button></div>
                  </form>
                ) : (
                  <>
                    <p className="text-[15px] leading-snug mt-1"><span className="text-[11px] text-ink-3 mr-1.5">だから、お客様は</span>{exp ?? <span className="text-warm">（体験価値が空です）</span>}</p>
                    {hasB ? (
                      <p className="text-[15px] leading-snug mt-1"><span className="text-[11px] text-ink-3 mr-1.5">なぜなら</span>{r.because_phrase}</p>
                    ) : (
                      <button type="button" onClick={() => setEditing(r.id)} className="mt-1 text-[14px] text-warm hover:underline underline-offset-4 text-left">なぜなら…？　← 根拠を書くと三連になります</button>
                    )}
                    <p className="text-[11px] text-ink-3 mt-1.5 flex flex-wrap gap-x-3">
                      {hasB && <span>{TAG[r.because_tag ?? "hypothesis"]}</span>}
                      {r.trust_axis && <span>{BECAUSE_TYPES.find((t) => t.key === r.trust_axis)?.label}</span>}
                      {aiB && <span className="text-verify">なぜならはAIの下書き</span>}
                      {r.because_only_us && <span className="text-navy font-medium">当社しかありません</span>}
                    </p>
                    <div className="mt-2 flex gap-1">
                      <button type="button" className="btn-text" onClick={() => setEditing(r.id)}>直す</button>
                      {aiB && (
                        <form action={saveTriple}><input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="approve" /><button className="btn-text text-navy" type="submit">承認</button></form>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
