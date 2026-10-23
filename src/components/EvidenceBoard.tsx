import { addEvidence, decideEvidence, markClaimFact } from "@/app/(app)/sheet/evidence/actions";
import { EVIDENCE_KINDS, KIND_SHORT, STRENGTH_LABEL, claimKey, claimRefOf } from "@/lib/evidence";
import { EVIDENCE_TAG_LABEL } from "@/lib/brakes";

export type EvClaim = { ref: string; label: string; text: string; tag: string; brakeWords?: string };
export type EvRow = { id: string; seq: number; rank: number | null; primary: boolean; value: string; experience: string | null; claims: EvClaim[] };
export type Ev = { id: string; row_id: string; what: string | null; content: string; kind: string; source: string | null; strength: string | null; status: string; claim_ref: string | null; created_by: string };

const tagText: Record<string, string> = { fact: "text-fact", verify: "text-verify", hypothesis: "text-hypo" };
const OPT = "rounded-[var(--radius)] border px-3 py-1.5 text-[13px] font-medium transition-colors";

/** 1件の証拠（採用済み）または候補 */
function EvItem({ e, claimLabel }: { e: Ev; claimLabel: string | null }) {
  const cand = e.status === "candidate";
  return (
    <li className={`rounded-[var(--radius)] border px-4 py-3 ${cand ? "border-navy/40 bg-navy-soft" : "hairline bg-paper"}`}>
      <p className="text-[11px] text-ink-3 flex flex-wrap gap-x-3">
        {cand && <span className="font-semibold text-navy">{e.created_by === "ai" ? "AIが資料から見つけた候補" : "メンバーが足した候補（担当者の採用待ち）"}</span>}
        <span>{KIND_SHORT[e.kind] ?? e.kind}</span>
        {e.strength && <span>強さ {STRENGTH_LABEL[e.strength] ?? e.strength}</span>}
        {claimLabel && <span>裏づけ：{claimLabel}</span>}
      </p>
      {e.what && <p className="text-[12px] text-ink-2 mt-1">{e.what}</p>}
      <p className="text-[14px] leading-relaxed mt-1 whitespace-pre-line">{e.content}</p>
      {e.source && <p className="text-[11px] text-ink-3 mt-1">出所：{e.source}</p>}
      {cand ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <form action={decideEvidence} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={e.id} /><input type="hidden" name="action" value="accept" />
            <select name="kind" defaultValue={e.kind === "named_voice" ? "public_voice" : e.kind} className="border-b hairline py-1 text-[13px] bg-transparent" aria-label="証拠の種類">
              {EVIDENCE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.short}</option>)}
            </select>
            <button className={OPT + " border-navy bg-navy text-on-accent font-semibold hover:brightness-110"} type="submit">採用する</button>
          </form>
          <form action={decideEvidence}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="action" value="drop" /><button className={OPT + " border-ink-3 bg-paper text-ink-2 hover:bg-paper-2"} type="submit">見送る</button></form>
          <span className="text-[11px] text-ink-3">「実名の声」は、本人の許諾を確認してから選んでください。</span>
        </div>
      ) : (
        <form action={decideEvidence} className="mt-1.5"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="action" value="drop" /><button className="btn-text text-xs" type="submit">取り下げる</button></form>
      )}
    </li>
  );
}

/** 組ごとに、裏づけたい「なぜなら」と、ついている証拠・AIの候補・証拠を足すフォームを並べる */
export function EvidenceBoard({ rows, evidences }: { rows: EvRow[]; evidences: Ev[] }) {
  if (rows.length === 0) return <p className="text-sm text-ink-3">まだ組がありません。</p>;
  const byRow = new Map<string, Ev[]>();
  for (const e of evidences) byRow.set(e.row_id, [...(byRow.get(e.row_id) ?? []), e]);
  return (
    <ol className="space-y-6">
      {rows.map((r) => {
        const evs = byRow.get(r.id) ?? [];
        const adopted = evs.filter((e) => e.status === "adopted");
        const cands = evs.filter((e) => e.status === "candidate");
        const label = (key: string | null) => {
          // 主張を書き直したあとの証拠は「書き直す前の文への証拠」と出す
          const c = r.claims.find((x) => x.ref === claimRefOf(key));
          return c ? (key === claimKey(c.ref, c.text) ? c.label : `${c.label}（書き直す前の文）`) : null;
        };
        return (
          <li key={r.id} className="rounded-[var(--radius)] border hairline overflow-hidden">
            <details open={adopted.length === 0 || cands.length > 0}>
              <summary className="cursor-pointer list-none bg-paper-2 px-5 py-3 flex items-start gap-3 [&::-webkit-details-marker]:hidden">
                <span className="num text-xs text-ink-3 w-10 pt-1">{r.rank ? `${r.rank}位` : r.seq}</span>
                <span className="flex-1 min-w-0">
                  <span className="serif block text-[16px] leading-snug"><span className="text-[11px] text-ink-3 font-normal mr-1.5">御社は</span>{r.value}{r.primary && <span className="ml-2 text-[11px] text-navy font-semibold">主役の組</span>}</span>
                  {r.experience && <span className="block text-[13px] text-ink-2 mt-0.5"><span className="text-[11px] text-ink-3 mr-1.5">だから、お客様は</span>{r.experience}</span>}
                </span>
                <span className="text-[11px] whitespace-nowrap pt-1 text-right">
                  {adopted.length > 0 ? <span className="text-ink-2">証拠 {adopted.length}件</span> : <span className="text-warm">証拠 未</span>}
                  {cands.length > 0 && <span className="block text-navy">候補 {cands.length}件</span>}
                </span>
              </summary>

              <div className="px-5 py-4 space-y-5">
                {/* 裏づけたい主張 */}
                <div>
                  <p className="text-[12px] font-semibold text-ink-2">裏づけたい「なぜなら」</p>
                  {r.claims.length === 0 ? (
                    <p className="text-[13px] text-ink-3 mt-1">この組には、まだ「なぜなら」がありません（STEP 4・5 で書くと、ここに並びます）。証拠は下から足せます。</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {r.claims.map((c) => {
                        const n = adopted.filter((e) => e.claim_ref === claimKey(c.ref, c.text)).length;
                        return (
                          <li key={c.ref} className="text-[13px] leading-snug border-l-2 hairline pl-3">
                            <span className="text-[11px] text-ink-3">{c.label}{c.brakeWords ? `　ブレーキ「${c.brakeWords}」` : ""}</span>
                            <span className="block">{c.text}</span>
                            <span className="text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                              <span className={tagText[c.tag] ?? "text-hypo"}>{EVIDENCE_TAG_LABEL[c.tag] ?? c.tag}</span>
                              <span className="text-ink-3">証拠 {n}件</span>
                              {n > 0 && c.tag !== "fact" && (
                                <form action={markClaimFact} data-admin-only className="inline">
                                  <input type="hidden" name="row_id" value={r.id} /><input type="hidden" name="claim_ref" value={c.ref} />
                                  <button className={OPT + " border-fact text-fact bg-paper hover:bg-paper-2 py-0.5"} type="submit">証拠がついたので「事実」に変える</button>
                                </form>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {cands.length > 0 && (
                  <div>
                    <p className="text-[12px] font-semibold text-navy">候補（担当者が採用するまで証拠になりません）</p>
                    <ul className="mt-2 space-y-2">{cands.map((e) => <EvItem key={e.id} e={e} claimLabel={label(e.claim_ref)} />)}</ul>
                  </div>
                )}

                {adopted.length > 0 && (
                  <div>
                    <p className="text-[12px] font-semibold text-ink-2">ついている証拠</p>
                    <ul className="mt-2 space-y-2">{adopted.map((e) => <EvItem key={e.id} e={e} claimLabel={label(e.claim_ref)} />)}</ul>
                  </div>
                )}

                {/* 証拠を足す */}
                <details className="rounded-[var(--radius)] border hairline">
                  <summary className="cursor-pointer px-4 py-2 text-[13px] text-navy font-semibold">＋ 証拠を足す</summary>
                  <form action={addEvidence} className="px-4 pb-4 pt-1 space-y-3 text-[13px]">
                    <input type="hidden" name="row_id" value={r.id} />
                    <label className="block"><span className="text-[11px] text-ink-3">どの「なぜなら」を裏づけるか</span>
                      <select name="claim_ref" defaultValue={r.claims[0]?.ref ?? ""} className="block w-full border-b hairline py-1 bg-transparent">
                        {r.claims.map((c) => <option key={c.ref} value={c.ref}>{c.label}：{c.text.slice(0, 40)}{c.text.length > 40 ? "…" : ""}</option>)}
                        <option value="">その他（この組全体）</option>
                      </select>
                    </label>
                    <label className="block"><span className="text-[11px] text-ink-3">何を裏づけるか（一言）</span>
                      <input name="what" maxLength={100} className="w-full border-b hairline py-1 bg-transparent" placeholder="例：納期を守っていること" /></label>
                    <label className="block"><span className="text-[11px] text-ink-3">内容（お客様の言葉・数字・認定など。聞いたまま、書かれたままに）</span>
                      <textarea name="content" required rows={3} maxLength={2000} className="w-full border-b hairline py-1 bg-transparent" /></label>
                    <div className="flex flex-wrap gap-4">
                      <label><span className="text-[11px] text-ink-3 block">種類</span>
                        <select name="kind" defaultValue="own_fact" className="border-b hairline py-1 bg-transparent">
                          {EVIDENCE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                        </select></label>
                      <label className="flex-1 min-w-[200px]"><span className="text-[11px] text-ink-3 block">出所（誰が・どこで・いつ）</span>
                        <input name="source" maxLength={300} className="w-full border-b hairline py-1 bg-transparent" placeholder="例：サンプル工業 購買部 2026年9月のアンケート" /></label>
                    </div>
                    <button className="btn-primary" type="submit">この証拠を足す</button>
                  </form>
                </details>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
