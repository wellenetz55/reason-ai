"use client";
import { useEffect, useRef, useState } from "react";
import { DwellField } from "@/components/DwellField";
import clsx from "clsx";
import { reviewRow } from "@/app/(app)/sheet/diverge/actions";
import { SealReason, SealBadge } from "@/components/SealReason";

type Row = {
  id: string; seq: number; value_raw: string | null; experience_value_v1: string | null; target: string | null; one_liner: string | null;
  target_tag: string | null; facet: string | null; round: number; status: string; created_by: string; confirmed_at: string | null;
  sealed?: string | null; // 封をした確認セッション名（封の対象の組だけ）
};

export function RowList({ rows, facets }: { rows: Row[]; facets: { key: string; label: string }[] }) {
  const label = (k: string | null) => facets.find((f) => f.key === k)?.label ?? "";
  const visible = rows.filter((r) => r.status !== "merged");
  if (visible.length === 0) {
    return <p className="text-sm text-ink-3">まだ1組もありません。上の問いに答えるか、AIに下書きを出させてください。</p>;
  }
  return (
    <ol className="divide-y divide-hair">
      {visible.map((r) => <RowItem key={r.id} row={r} facetLabel={label(r.facet)} />)}
    </ol>
  );
}

function RowItem({ row, facetLabel }: { row: Row; facetLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.value_raw ?? "");
  const [exp, setExp] = useState(row.experience_value_v1 ?? "");
  const hasExp = !!row.experience_value_v1;
  // 開くたびに最新の行の内容で入力欄を埋める（AIの下書きが後から付いた場合に空欄で上書きしないため）
  const startEdit = () => {
    setText(row.value_raw ?? "");
    setExp(row.experience_value_v1 ?? "");
    setEditing(true);
  };
  const shownAt = useRef<number>(Date.now());
  useEffect(() => { shownAt.current = Date.now(); }, [row.id]);
  const isDraft = row.created_by === "ai";
  const held = row.status === "held" || row.status === "dropped";
  const confirmed = !!row.confirmed_at && !held;
  const tag = row.target_tag?.includes("仮説") ? "tag-hypo" : isDraft ? "tag-verify" : "tag-none";

  return (
    <li className={clsx("py-4 pl-4 tag-line", confirmed ? "border-l-navy" : tag, held && "bg-grey-row opacity-70")}>
      <div className="flex flex-wrap sm:flex-nowrap items-start gap-x-4 gap-y-2">
        <span className="num text-xs text-ink-3 w-6 pt-1.5">{row.seq}</span>
        <div className="flex-1 min-w-0">
          {editing ? (
            <form action={async (fd) => { await reviewRow(fd); setEditing(false); }}>
              <input type="hidden" name="row_id" value={row.id} />
              <input type="hidden" name="action" value="fix" />
              <DwellField since={shownAt} />
              <label className="block text-[11px] text-ink-3">御社は</label>
              <textarea name="after" value={text} onChange={(e) => setText(e.target.value)} rows={2} className="serif w-full text-[18px] leading-snug border-b hairline" />
              <label className="block text-[11px] text-ink-3 mt-3">だから、お客様は</label>
              <textarea name="after_experience" value={exp} onChange={(e) => setExp(e.target.value)} rows={2} placeholder="〜と感じることができる" className="w-full text-[16px] leading-snug border-b hairline" />
              {row.sealed && <SealReason />}
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
                <button type="button" onClick={startEdit} className="mt-1 text-[14px] text-warm hover:underline underline-offset-4 text-left">だから、お客様は…？　← 体験価値を書くと1組になります</button>
              )}
            </>
          )}
          <p className="text-xs text-ink-3 mt-1.5 flex gap-3">
            {facetLabel && <span>{facetLabel}</span>}
            {row.target && <span>{row.target}向け</span>}
            {isDraft && <span className="text-verify">AIの下書き</span>}
            {row.target_tag?.includes("仮説") && <span className="text-hypo">仮説</span>}
            {held && <span>{row.status === "dropped" ? "却下" : "保留"}</span>}
            {confirmed && <span className="text-navy font-medium">確定</span>}
            {row.sealed && <SealBadge label={row.sealed} />}
          </p>
          {row.one_liner && <p className="text-sm text-ink-2 mt-1">一言で：{row.one_liner}</p>}
        </div>
        {!editing && (
          <div className="flex flex-wrap gap-1 shrink-0 pt-1 w-full sm:w-auto pl-10 sm:pl-0">
            <button className="btn-text" onClick={startEdit}>直す</button>
            {!isDraft && !held && !confirmed && (
              <form action={reviewRow}>
                <input type="hidden" name="row_id" value={row.id} />
                <input type="hidden" name="action" value="confirm" />
                <DwellField since={shownAt} />
                <button className="btn-text text-navy" type="submit">確定</button>
              </form>
            )}
            {confirmed && (
              <form action={reviewRow}>
                <input type="hidden" name="row_id" value={row.id} />
                <input type="hidden" name="action" value="unconfirm" />
                <button className="btn-text" type="submit">確定を外す</button>
              </form>
            )}
            {(isDraft || held) && (
              <form action={reviewRow}>
                <input type="hidden" name="row_id" value={row.id} />
                <input type="hidden" name="action" value="approve" />
                <DwellField since={shownAt} />
                <button className="btn-text" type="submit">承認</button>
              </form>
            )}
            {!held && !row.sealed && (
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
