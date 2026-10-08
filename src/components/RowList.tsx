"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { reviewRow } from "@/app/(app)/sheet/diverge/actions";

type Row = {
  id: string; seq: number; value_raw: string | null; experience_value_v1: string | null; target: string | null; one_liner: string | null;
  target_tag: string | null; facet: string | null; round: number; status: string; created_by: string;
};

export function RowList({ rows, facets }: { rows: Row[]; facets: { key: string; label: string }[] }) {
  const label = (k: string | null) => facets.find((f) => f.key === k)?.label ?? "";
  const visible = rows.filter((r) => r.status !== "merged");
  if (visible.length === 0) {
    return <p className="text-sm text-ink-3">まだ1組もありません。上の問いに答えるか、AIに下書きを出させてください。</p>;
  }
  return (
    <ol className="divide-y hairline">
      {visible.map((r) => <RowItem key={r.id} row={r} facetLabel={label(r.facet)} />)}
    </ol>
  );
}

function RowItem({ row, facetLabel }: { row: Row; facetLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.value_raw ?? "");
  const [exp, setExp] = useState(row.experience_value_v1 ?? "");
  const hasExp = !!row.experience_value_v1;
  const shownAt = useRef<number>(Date.now());
  useEffect(() => { shownAt.current = Date.now(); }, [row.id]);
  const isDraft = row.created_by === "ai";
  const held = row.status === "held" || row.status === "dropped";
  const tag = row.target_tag?.includes("仮説") ? "tag-hypo" : isDraft ? "tag-verify" : "tag-none";

  return (
    <li className={clsx("py-4 pl-4 tag-line", tag, held && "bg-grey-row opacity-70")}>
      <div className="flex items-start gap-4">
        <span className="num text-xs text-ink-3 w-6 pt-1.5">{row.seq}</span>
        <div className="flex-1 min-w-0">
          {editing ? (
            <form action={reviewRow} onSubmit={() => setEditing(false)}>
              <input type="hidden" name="row_id" value={row.id} />
              <input type="hidden" name="action" value="fix" />
              <input type="hidden" name="dwell_ms" value={Date.now() - shownAt.current} />
              <label className="block text-[11px] text-ink-3">御社は</label>
              <textarea name="after" value={text} onChange={(e) => setText(e.target.value)} rows={2} className="serif w-full text-[18px] leading-snug border-b hairline" />
              <label className="block text-[11px] text-ink-3 mt-3">だから、お客様は</label>
              <textarea name="after_experience" value={exp} onChange={(e) => setExp(e.target.value)} rows={2} placeholder="〜と感じることができる" className="w-full text-[16px] leading-snug border-b hairline" />
              <div className="mt-2 flex gap-2">
                <button className="btn-primary" type="submit">直して確定</button>
                <button className="btn-text" type="button" onClick={() => setEditing(false)}>やめる</button>
              </div>
            </form>
          ) : (
            <>
              <p className="serif text-[18px] leading-snug"><span className="text-[12px] text-ink-3 font-normal mr-1.5">御社は</span>{row.value_raw}</p>
              {hasExp ? (
                <p className="text-[16px] leading-snug mt-1 text-ink"><span className="text-[12px] text-ink-3 mr-1.5">だから、お客様は</span>{row.experience_value_v1}</p>
              ) : (
                <button type="button" onClick={() => setEditing(true)} className="mt-1 text-[14px] text-warm hover:underline underline-offset-4 text-left">だから、お客様は…？　← 体験価値を書くと1組になります</button>
              )}
            </>
          )}
          <p className="text-xs text-ink-3 mt-1.5 flex gap-3">
            {facetLabel && <span>{facetLabel}</span>}
            {row.target && <span>{row.target}向け</span>}
            {isDraft && <span className="text-verify">AIの下書き</span>}
            {row.target_tag?.includes("仮説") && <span className="text-hypo">仮説</span>}
            {held && <span>保留</span>}
          </p>
          {row.one_liner && <p className="text-sm text-ink-2 mt-1">一言で：{row.one_liner}</p>}
        </div>
        {!editing && (
          <div className="flex gap-1 shrink-0 pt-1">
            <button className="btn-text" onClick={() => setEditing(true)}>直す</button>
            {(isDraft || held) && (
              <form action={reviewRow}>
                <input type="hidden" name="row_id" value={row.id} />
                <input type="hidden" name="action" value="approve" />
                <input type="hidden" name="dwell_ms" value={Date.now() - shownAt.current} />
                <button className="btn-text" type="submit">承認</button>
              </form>
            )}
            {!held && (
              <form action={reviewRow}>
                <input type="hidden" name="row_id" value={row.id} />
                <input type="hidden" name="action" value="hold" />
                <button className="btn-text" type="submit">保留</button>
              </form>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
