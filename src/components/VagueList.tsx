"use client";
import { useState } from "react";
import { findVague, hasConcrete } from "@/lib/vague";
import { resolveDiagnosis, redraftDiagnosis, reopenDiagnosis } from "@/app/(app)/sheet/merge/actions";

/** AIのふわっと度（1〜3）の言葉。0 は印なし */
const VAGUE_LABEL: Record<number, string> = { 1: "少しふわっとしている", 2: "ふわっとしている", 3: "どの会社でも言える言葉" };

/** 言い直し案の下の選択肢ボタン（罫線で囲って目立たせる） */
const OPT = "rounded-[var(--radius)] border px-3 py-1.5 text-[13px] font-medium transition-colors";

type Row = { id: string; seq: number; value_raw: string | null; experience_value_v1: string | null };
type Diag = { row_id: string; vague_score: number; issues: string[]; suggestion_value: string | null; suggestion_experience: string | null; resolved: string | null; checked_at: string; redraft_history?: string[] | null };

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
    // AIがレビュー済みで「具体的（0）」かつ案なし → 辞書や簡易判定の印があっても、AIの判断を優先して一覧から外す（下の「AIは問題なし」に出す）
    const aiOk = !!d && d.resolved == null && d.vague_score === 0 && !d.suggestion_value;
    const undecided = d?.resolved !== "kept" && d?.resolved !== "accepted" && d?.resolved !== "held";
    return { r, d, dict, concrete, score, aiOk, show: (dict.length > 0 || score >= 1 || !concrete) && undecided && !aiOk, okShow: aiOk && (dict.length > 0 || !concrete) };
  });
  const aiOkRows = flagged.filter((x) => x.okShow);
  const flaggedList = flagged.filter((x) => x.show).sort((a, b) => b.score - a.score || b.dict.length - a.dict.length);

  // 決めた組（この案で決定／初期案のまま）。一覧からは消えるが、行はシートに残っている。ここで見直せる
  const decided = rows.map((r) => ({ r, d: dmap.get(r.id) })).filter((x) => x.d && (x.d.resolved === "accepted" || x.d.resolved === "kept"));
  const DECIDED_LABEL: Record<string, string> = { accepted: "AIの案で決定", kept: "初期案（自社入力）のまま" };
  const decidedBlock = decided.length > 0 && (
    <details className="mt-10 rounded-[var(--radius)] border-2 border-navy overflow-hidden">
      <summary className="cursor-pointer list-none bg-navy text-on-accent px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-paper text-navy num font-bold text-[16px] shrink-0">{decided.length}</span>
        <span className="flex-1 min-w-[200px]">
          <span className="serif block text-[18px] leading-tight">決めた組</span>
          <span className="block text-[12px] text-on-accent/80 mt-0.5">御社が選択を済ませた組。シートには残っています。開くと一覧と「もう一度見直す」</span>
        </span>
        <span className="text-[12px] text-on-accent/80 shrink-0">▼ 開く／閉じる</span>
      </summary>
      <ul className="px-5 py-2 divide-y divide-hair bg-paper">
        {decided.map(({ r, d }) => (
          <li key={r.id} className="py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
            <span className="num text-xs text-ink-3 w-6 pt-0.5">{r.seq}</span>
            <span className="flex-1 min-w-[240px]"><span className="serif">{r.value_raw}</span>{r.experience_value_v1 && <span className="block text-ink-2 text-[13px]">だから、お客様は {r.experience_value_v1}</span>}</span>
            <span className="text-[11px] text-ink-3 whitespace-nowrap">{DECIDED_LABEL[d!.resolved!] ?? d!.resolved}</span>
            <form action={reopenDiagnosis}><input type="hidden" name="row_id" value={r.id} /><button className="btn-text text-xs" type="submit">もう一度見直す</button></form>
          </li>
        ))}
      </ul>
    </details>
  );

  if (rows.length === 0) return <p className="text-sm text-ink-2 mt-3">まだ組がありません。先に STEP 1 で提供価値・体験価値の組を出してください。</p>;
  const aiOkBlock = aiOkRows.length > 0 && (
    <details className="mt-8 rounded-[var(--radius)] border-2 border-fact overflow-hidden">
      <summary className="cursor-pointer list-none bg-fact text-on-accent px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-paper text-fact num font-bold text-[16px] shrink-0">{aiOkRows.length}</span>
        <span className="flex-1 min-w-[200px]">
          <span className="serif block text-[18px] leading-tight">このままで通用する言葉 ✓</span>
          <span className="block text-[12px] text-on-accent/85 mt-0.5">AIがレビューして「具体的で、どの会社でも言える言葉ではない」と判断した組。言い直しは不要です。開くと内容が見られます</span>
        </span>
        <span className="text-[12px] text-on-accent/85 shrink-0">▼ 開く／閉じる</span>
      </summary>
      <ul className="px-5 py-2 divide-y divide-hair bg-paper">
        {aiOkRows.map(({ r, dict, concrete }) => (
          <li key={r.id} className="py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1 text-sm">
            <span className="num text-xs text-ink-3 w-6 pt-0.5">{r.seq}</span>
            <span className="flex-1 min-w-[240px]"><span className="serif">{r.value_raw}</span>{r.experience_value_v1 && <span className="block text-ink-2 text-[13px]">だから、お客様は {r.experience_value_v1}</span>}<span className="block text-[11px] text-ink-3 mt-0.5">{dict.length > 0 ? `辞書の印：${[...new Set(dict)].join("・")}` : ""}{!concrete ? "　数字・固有名詞なし（AIは文脈から具体的と判断）" : ""}</span></span>
            <span className="flex gap-1">
              <form action={resolveDiagnosis}><input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="keep" /><button className="btn-text text-xs" type="submit">このままでよい</button></form>
              <form action={resolveDiagnosis}><input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="hold" /><button className="btn-text text-xs" type="submit">保留</button></form>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );

  if (flaggedList.length === 0) return <><p className="text-sm text-ink-2 mt-3">言い直しが必要な組はありません。</p>{aiOkBlock}{decidedBlock}</>;
  return (
    <>
    <p className="mt-4 text-[12px] text-ink-3">まだ決めていない組（{flaggedList.length}）── 印がついた理由と、AIの言い直し案。どれかを選ぶと下の「決めた組」に移ります</p>
    <ol className="mt-2 divide-y divide-hair">
      {flaggedList.map(({ r, d, dict, concrete, score }) => (
        <li key={r.id} className="py-4 pl-4 tag-line tag-hypo">
          <div className="flex items-start gap-4">
            <span className="num text-xs text-ink-3 w-6 pt-1">{r.seq}</span>
            <div className="flex-1 min-w-0">
              <p className="serif text-[16px] leading-snug"><span className="text-[11px] text-ink-3 font-normal mr-1.5">御社は</span><Mark text={r.value_raw} /></p>
              {r.experience_value_v1 && <p className="text-[15px] leading-snug mt-0.5"><span className="text-[11px] text-ink-3 mr-1.5">だから、お客様は</span><Mark text={r.experience_value_v1} /></p>}
              <p className="text-[12px] mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {dict.length > 0 && <span className="text-warm font-semibold">どの会社でも言える語：{[...new Set(dict)].join("・")}</span>}
                {!concrete && <span className="text-warm font-semibold">数字・固有名詞がない</span>}
                {d && d.resolved !== "accepted" && d.issues.map((i, k) => <span key={k} className="text-warm font-semibold">AI：{i}</span>)}
                {score > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-hypo" title="AIの見立て：1＝少しふわっと／2＝ふわっと／3＝どの会社でも言える">
                    <span className="inline-flex gap-0.5" aria-hidden>{[1, 2, 3].map((k) => <span key={k} className={`inline-block w-2 h-2 rounded-full ${k <= score ? "bg-hypo" : "border border-hypo/60"}`} />)}</span>
                    {VAGUE_LABEL[score] ?? ""}
                  </span>
                )}
              </p>
              {(!d || d.resolved == null) && (
                editing === r.id ? (
                  <form action={async (fd) => { await resolveDiagnosis(fd); setEditing(null); }} className="mt-3 rounded-[var(--radius)] bg-navy-soft px-4 py-3">
                    <input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="accept" />
                    <label className="block text-[11px] text-navy">{d?.suggestion_value ? "AIの案を元に、御社の言葉で直す（加筆・修正してから決定）" : "御社の言葉で直す（数字・固有名詞・条件を足すと強くなります）"}</label>
                    <p className="text-[11px] text-ink-3 mt-1">御社は</p>
                    <textarea name="after" defaultValue={d?.suggestion_value ?? r.value_raw ?? ""} rows={2} className="w-full border-b hairline py-1 text-sm bg-transparent" />
                    <p className="text-[11px] text-ink-3 mt-2">だから、お客様は</p>
                    <textarea name="after_experience" defaultValue={d?.suggestion_experience ?? r.experience_value_v1 ?? ""} rows={2} className="w-full border-b hairline py-1 text-sm bg-transparent" placeholder="…と感じることができる" />
                    <div className="mt-2 flex gap-2"><button className="btn-primary" type="submit">この内容で決定する</button><button type="button" className="btn-text" onClick={() => setEditing(null)}>やめる</button></div>
                  </form>
                ) : (
                  <div className={`mt-3 rounded-[var(--radius)] px-4 py-3 ${d?.suggestion_value ? "bg-navy-soft" : "bg-paper-2"}`}>
                    {d?.suggestion_value ? (
                      <>
                        <p className="text-[11px] text-navy">AIの言い直し案</p>
                        <p className="text-sm mt-1">{d.suggestion_value}</p>
                        {d.suggestion_experience && <p className="text-sm text-ink-2 mt-0.5">だから、お客様は {d.suggestion_experience}</p>}
                      </>
                    ) : (
                      <p className="text-[12px] text-ink-2">{d ? "AIは言い直し案を出していません（印の理由を見て、御社で直すか、AIに案を頼めます）" : "まだAIのレビュー前です（辞書の印だけ）。上の「レビューしてもらう」で案が出ます"}</p>
                    )}
                    {(d?.redraft_history?.length ?? 0) > 0 && (
                      <details className="mt-2 text-[12px]">
                        <summary className="cursor-pointer text-ink-3">前に出た案（{d!.redraft_history!.length}）</summary>
                        <ul className="mt-1 space-y-0.5 text-ink-2">{d!.redraft_history!.map((h, k) => <li key={k}>・{h}</li>)}</ul>
                      </details>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {d?.suggestion_value && <form action={resolveDiagnosis}><input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="accept" /><button className={OPT + " border-navy bg-navy text-on-accent font-semibold hover:brightness-110"} type="submit">この案で決定する</button></form>}
                      <form action={resolveDiagnosis}><input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="keep" /><button className={OPT + " border-ink-3 bg-paper text-ink hover:bg-paper-2"} type="submit">初期案（自社入力）のままにする</button></form>
                      <form action={redraftDiagnosis} data-busy-timeout="90000"><input type="hidden" name="row_id" value={r.id} /><button className={OPT + " border-navy bg-paper text-navy hover:bg-navy-soft"} type="submit">{d?.suggestion_value ? "この組だけAIで別案を出す" : "この組だけAIに言い直し案を頼む"}</button></form>
                      <button type="button" className={OPT + " border-navy bg-paper text-navy hover:bg-navy-soft"} onClick={() => setEditing(r.id)}>一部自社で直す</button>
                      <form action={resolveDiagnosis}><input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="action" value="hold" /><button className={OPT + " border-ink-3 bg-paper text-ink-2 hover:bg-paper-2"} type="submit">保留にする</button></form>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
    {aiOkBlock}
    {decidedBlock}
    </>
  );
}
