"use client";
import { useState } from "react";
import { PROFILE_ITEMS, STATUS_LABEL_ITEM } from "@/lib/profileItems";

type Item = { key: string; draft: string | null; value: string | null; status: string; tag: string | null; source: string | null };
const TAG: Record<string, string> = { fact: "事実", verify: "要確認", hypothesis: "仮説" };
const tagCls: Record<string, string> = { fact: "tag-fact", verify: "tag-verify", hypothesis: "tag-hypo" };

/**
 * 「御社の説明」の項目一覧。A は AI 下書き → 直す／承認／保留。B は問いに御社が答える（AI の仮説は薄く）。
 * 一括承認は置かない（設計方針）。
 */
export function ProfileItems({ items, bq, oneLiner, review }: {
  items: Item[];
  bq: Record<string, string>;
  oneLiner: string | null;
  review: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const byKey = new Map(items.map((i) => [i.key, i]));

  const renderA = (def: (typeof PROFILE_ITEMS)[number]) => {
    const it = byKey.get(def.key);
    const status = def.fixed ? (oneLiner ? "approved" : "empty") : (it?.status ?? "empty");
    const shown = def.fixed ? oneLiner : (status === "approved" || status === "fixed" ? it?.value : it?.draft);
    const tag = status === "fixed" ? "fact" : (it?.tag ?? "hypothesis");
    const open = editing === def.key;
    return (
      <li key={def.key} className={`py-5 ${status === "held" ? "opacity-50" : ""}`}>
        <div className="flex items-baseline gap-3">
          <h3 className="serif text-[15px]">{def.label}</h3>
          <span className="text-[11px] text-ink-3">{STATUS_LABEL_ITEM[status]}</span>
          {status !== "empty" && !def.fixed && <span className="text-[11px] text-ink-3">· {TAG[tag] ?? tag}</span>}
          {it?.source && status !== "empty" && <span className="text-[11px] text-ink-3 truncate max-w-[40ch]">· {it.source}</span>}
        </div>
        {def.hint && <p className="text-[12px] text-ink-3 mt-0.5">{def.hint}</p>}
        {open ? (
          <form action={async (fd) => { await review(fd); setEditing(null); }} className="mt-2">
            <input type="hidden" name="key" value={def.key} /><input type="hidden" name="action" value="fix" />
            <textarea name="after" defaultValue={shown ?? ""} rows={4} className="w-full border-b hairline py-2 text-sm" autoFocus />
            <div className="mt-2 flex gap-2"><button className="btn-primary" type="submit">確定</button><button type="button" className="btn-text" onClick={() => setEditing(null)}>やめる</button></div>
          </form>
        ) : (
          <>
            <p className={`tag-line ${status === "empty" ? "tag-none" : tagCls[tag] ?? "tag-hypo"} pl-4 mt-2 text-sm leading-relaxed whitespace-pre-line ${shown ? "" : "text-ink-3"}`}>
              {shown || (def.fixed ? "適合診断の記録がまだありません" : "資料に見つかりませんでした。「直す」から書けます")}
            </p>
            {!def.fixed && (
              <div className="mt-2 flex gap-1">
                <button type="button" className="btn-text" onClick={() => setEditing(def.key)}>直す</button>
                {status === "draft" && (
                  <form action={review}><input type="hidden" name="key" value={def.key} /><input type="hidden" name="action" value="approve" /><button className="btn-text text-navy" type="submit">承認</button></form>
                )}
                {status !== "held" && status !== "empty" && (
                  <form action={review}><input type="hidden" name="key" value={def.key} /><input type="hidden" name="action" value="hold" /><button className="btn-text" type="submit">保留</button></form>
                )}
                {(status === "approved" || status === "fixed" || status === "held") && (
                  <form action={review}><input type="hidden" name="key" value={def.key} /><input type="hidden" name="action" value="reopen" /><button className="btn-text" type="submit">戻す</button></form>
                )}
              </div>
            )}
          </>
        )}
      </li>
    );
  };

  const renderB = (def: (typeof PROFILE_ITEMS)[number]) => {
    const it = byKey.get(def.key);
    const answered = it?.status === "fixed" && it.value;
    const open = editing === def.key || (!answered && editing === null && false);
    return (
      <li key={def.key} className="py-5">
        <div className="flex items-baseline gap-3">
          <h3 className="serif text-[15px]">{def.label}</h3>
          <span className="text-[11px] text-ink-3">{answered ? "回答済み" : "未回答"}</span>
        </div>
        <p className="text-sm text-ink-2 mt-1 max-w-[64ch] leading-relaxed">{bq[def.key] || "（問いの文面はベレネッツが設定します）"}</p>
        {it?.draft && !answered && (
          <p className="tag-line tag-hypo pl-4 mt-2 text-[13px] text-ink-3 leading-relaxed whitespace-pre-line">AIの仮説：{it.draft}</p>
        )}
        {open ? (
          <form action={async (fd) => { await review(fd); setEditing(null); }} className="mt-2">
            <input type="hidden" name="key" value={def.key} /><input type="hidden" name="action" value="answer" />
            <textarea name="after" defaultValue={it?.value ?? ""} rows={4} className="w-full border-b hairline py-2 text-sm" autoFocus placeholder="御社の言葉で" />
            <div className="mt-2 flex gap-2"><button className="btn-primary" type="submit">保存</button><button type="button" className="btn-text" onClick={() => setEditing(null)}>やめる</button></div>
          </form>
        ) : (
          <>
            {answered && <p className="tag-line tag-fact pl-4 mt-2 text-sm leading-relaxed whitespace-pre-line">{it!.value}</p>}
            <div className="mt-2"><button type="button" className="btn-text" onClick={() => setEditing(def.key)}>{answered ? "書き直す" : "答える"}</button></div>
          </>
        )}
      </li>
    );
  };

  return (
    <div>
      <ol className="divide-y hairline">{PROFILE_ITEMS.filter((d) => d.group === "A").map(renderA)}</ol>
      <h3 className="serif text-[17px] mt-12">御社にお聞きしたいこと</h3>
      <p className="text-sm text-ink-2 mt-1 max-w-[64ch]">資料には書いていないことです。キックオフでも話題にしますので、いま思うところを書いておいてください。AIの仮説は参考までに。</p>
      <ol className="divide-y hairline mt-2">{PROFILE_ITEMS.filter((d) => d.group === "B").map(renderB)}</ol>
    </div>
  );
}
