import { answerNiche, saveMarket } from "@/app/(app)/sheet/litmus/actions";
import { MARKS, MARK_LABEL, NICHE_QUESTIONS, MARKET_AXES, marketTotal, nicheAnswered, type AxisKey } from "@/lib/litmus";

export type LitmusRow = { id: string; seq: number; value_raw: string | null; experience: string | null; because: string | null };
export type Niche = { row_id: string; judged_by?: string | null; q1_pain_urgency: boolean | null; q2_actively_seeking: boolean | null; ai_q1: boolean | null; ai_q2: boolean | null; ai_note: string | null };
export type Market = { row_id: string; scored_by: string; magnitude_text: string | null; zougenjofu: string | null } & Partial<Record<AxisKey, number | string | null>>;

const yn = (b: boolean | null | undefined) => (b === true ? "yes" : b === false ? "no" : "");
const ynLabel = (b: boolean | null | undefined) => (b === true ? "はい" : b === false ? "いいえ" : "わからない");
const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

/** 組ごとに、ニッチの2問 → 市場フィット（◎○△×）。AIの仮判定は薄く横に出し、決めるのは御社 */
export function LitmusBoard({ rows, niche, market }: { rows: LitmusRow[]; niche: Niche[]; market: Market[] }) {
  if (rows.length === 0) return <p className="text-sm text-ink-3">まだ組がありません。STEP 1・2 で提供価値・体験価値の組を残してください。</p>;
  const nBy = new Map(niche.map((n) => [n.row_id, n]));
  const mine = new Map(market.filter((m) => m.scored_by === "customer").map((m) => [m.row_id, m]));
  const ai = new Map(market.filter((m) => m.scored_by === "ai").map((m) => [m.row_id, m]));
  const op = new Map(market.filter((m) => m.scored_by === "operator").map((m) => [m.row_id, m]));
  return (
    <ol className="space-y-6">
      {rows.map((r) => {
        const n = nBy.get(r.id);
        const m = mine.get(r.id);
        const a = ai.get(r.id);
        const o = op.get(r.id);
        const answered = nicheAnswered(n);
        const hold = answered && n!.q1_pain_urgency === false && n!.q2_actively_seeking === false;
        const t = m ? marketTotal(m) : null;
        return (
          <li key={r.id} className={`rounded-[var(--radius)] border hairline overflow-hidden ${hold ? "opacity-60" : ""}`}>
            <details open={!answered || !m}>
              <summary className="cursor-pointer list-none bg-paper-2 px-5 py-3 flex items-start gap-3 [&::-webkit-details-marker]:hidden">
                <span className="num text-xs text-ink-3 w-6 pt-1">{r.seq}</span>
                <span className="flex-1 min-w-0">
                  <span className="serif block text-[16px] leading-snug"><span className="text-[11px] text-ink-3 font-normal mr-1.5">御社は</span>{r.value_raw}</span>
                  {r.experience && <span className="block text-[13px] text-ink-2 mt-0.5"><span className="text-[11px] text-ink-3 mr-1.5">だから、お客様は</span>{r.experience}</span>}
                </span>
                <span className="text-[11px] text-ink-3 whitespace-nowrap pt-1 text-right">
                  {hold ? <span className="text-ink-2 font-semibold">保留候補</span> : answered ? <span>2問 済</span> : <span className="text-warm">2問 未{n?.ai_note ? "（AI案あり）" : ""}</span>}
                  <span className="block">{t && t.filled ? <span className="num">市場 {t.total}/{MARKET_AXES.length * 3}</span> : <span className="text-warm">市場 未</span>}</span>
                </span>
              </summary>

              {n?.ai_note && (!answered || !m) && (
                <div className="mx-5 mt-4 rounded-[var(--radius)] border border-navy/30 bg-navy-soft px-4 py-3 text-[13px] leading-relaxed">
                  <p className="text-[11px] font-semibold text-navy tracking-wide">AIの仮判定（たたき台）を下の欄に入れてあります</p>
                  <p className="mt-1">{n.ai_note}</p>
                  <p className="text-[12px] text-ink-2 mt-1">合っていればそのまま、違うところは選び直して、それぞれ「保存」を押してください。保存するまでは御社の判定になりません。</p>
                </div>
              )}
              <div className="px-5 py-4 grid gap-6 lg:grid-cols-2">
                {/* ニッチの2問 */}
                <form action={answerNiche} className="space-y-3">
                  <input type="hidden" name="row_id" value={r.id} />
                  <p className="text-[12px] font-semibold text-ink-2">1. 見込み客の切実さ（2問）</p>
                  {NICHE_QUESTIONS.map((qq) => {
                    const own = n ? (n[qq.col] as boolean | null) : null;
                    const aiv = n ? (n[qq.ai] as boolean | null) : undefined;
                    // 御社がまだ答えていない組は、AIの仮判定を下書きとして選んだ状態にしておく（保存するまで確定しない）
                    const cur = answered ? own : (n?.ai_note ? (aiv ?? null) : null);
                    return (
                      <fieldset key={qq.key} className="text-[13px]">
                        <legend className="leading-snug">{qq.text}</legend>
                        <div className="flex flex-wrap gap-3 mt-1.5">
                          {[["yes", "はい"], ["no", "いいえ"], ["", "わからない"]].map(([v, l]) => (
                            <label key={v} className="inline-flex items-center gap-1.5">
                              <input type="radio" name={qq.key} value={v} defaultChecked={yn(cur) === v} />{l}
                            </label>
                          ))}
                          {aiv !== undefined && n?.ai_note && <span className="text-[11px] text-ink-3">AIの仮判定：{ynLabel(aiv)}</span>}
                        </div>
                      </fieldset>
                    );
                  })}
                  {n?.ai_note && answered && m && <p className="text-[11px] text-ink-3">AIの見立て：{n.ai_note}</p>}
                  {hold && <p className="text-[12px] text-ink-2">2問とも「いいえ」です。この組は保留候補として、確認セッション②でベレネッツと扱いを決めます。</p>}
                  <button className="btn-primary" type="submit">2問を保存</button>
                </form>

                {/* 市場フィット */}
                <form action={saveMarket} className="space-y-3">
                  <input type="hidden" name="row_id" value={r.id} />
                  <p className="text-[12px] font-semibold text-ink-2">2. 市場で通用するか（◎○△×）</p>
                  <table className="w-full text-[13px]">
                    <tbody className="divide-y divide-hair">
                      {MARKET_AXES.map((ax) => {
                        const aiv = num(a?.[ax.key]);
                        const cur = m ? num(m[ax.key]) : aiv;
                        const opv = num(o?.[ax.key]);
                        return (
                          <tr key={ax.key}>
                            <td className="py-1.5 pr-2"><span title={ax.hint}>{ax.label}</span></td>
                            <td className="py-1.5 whitespace-nowrap">
                              <select name={ax.key} defaultValue={cur === null ? "" : String(cur)} className="border-b hairline py-0.5 bg-transparent">
                                <option value="">—</option>
                                {MARKS.map((mk) => <option key={mk.v} value={mk.v}>{mk.label}</option>)}
                              </select>
                            </td>
                            <td className="py-1.5 pl-2 text-[11px] text-ink-3 whitespace-nowrap">
                              {aiv !== null && <span>AI {MARK_LABEL[aiv]}</span>}
                              {opv !== null && <span className="ml-2 text-navy">ベレネッツ {MARK_LABEL[opv]}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <label className="block text-[13px]"><span className="text-[11px] text-ink-3">大きさ（この組で動く金額か件数。例：年間○件・○万円）</span>
                    <input name="magnitude_text" defaultValue={m?.magnitude_text ?? ""} maxLength={300} className="w-full border-b hairline py-1 bg-transparent" /></label>
                  <label className="block text-[13px]"><span className="text-[11px] text-ink-3">手の入れ方のメモ（伸ばす・減らす・やめる・足す）</span>
                    <textarea name="adjust_note" defaultValue={m?.zougenjofu ?? ""} rows={2} maxLength={500} className="w-full border-b hairline py-1 bg-transparent" /></label>
                  <button className="btn-primary" type="submit">市場の評価を保存</button>
                </form>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
