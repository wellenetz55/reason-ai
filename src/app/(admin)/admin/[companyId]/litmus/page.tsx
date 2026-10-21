import { notFound } from "next/navigation";
import Link from "next/link";
import { ClearQuery } from "@/components/ClearQuery";
import { requireOperator } from "@/lib/session";
import { loadFixedText } from "@/server/ai/client";
import { MARKET_AXES, MARKS, MARK_LABEL, NICHE_QUESTIONS, marketTotal } from "@/lib/litmus";
import { STATUS_LABEL } from "@/lib/stages";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveOperatorScore, confirmRanking, autoRank } from "./actions";

type M = Record<string, unknown> & { row_id: string; scored_by: string; total: number | null; rank?: number | null; kaiten_step?: number | null; magnitude_score?: number | null; magnitude_text?: string | null; zougenjofu?: string | null };
type N = { row_id: string; q1_pain_urgency: boolean | null; q2_actively_seeking: boolean | null; ai_q1: boolean | null; ai_q2: boolean | null; ai_note: string | null };

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const yn = (b: boolean | null | undefined) => (b === true ? "はい" : b === false ? "いいえ" : "—");
const AXES_MAX = MARKET_AXES.length * 3;

/** STEP 6 ベレネッツ側の採点：組ごとに ◎○△×・大きさ・回天のステップ・手の入れ方・仮順位。確定するとお客様のシートに順位が出る */
export default async function LitmusAdmin({ params, searchParams }: PageProps<"/admin/[companyId]/litmus">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const err = typeof sp?.error === "string" ? sp.error : null;
  const notice = typeof sp?.notice === "string" ? sp.notice : null;
  const { supabase } = await requireOperator();
  const [{ data: c }, { data: rows }, { data: niche }, { data: market, error: mErr }, kaitenText] = await Promise.all([
    supabase.from("companies").select("id, name, status").eq("id", companyId).maybeSingle(),
    supabase.from("sheet_rows").select("id, seq, value_raw, experience_value, experience_value_v1, because_phrase, rank").eq("company_id", companyId).eq("status", "active").order("seq"),
    supabase.from("litmus_niche").select("row_id, q1_pain_urgency, q2_actively_seeking, ai_q1, ai_q2, ai_note, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId),
    // 回天のステップ・仮順位はログイン中のロールでは読めない列。ベレネッツであることは上で確かめ済みなのでサーバ側で読む
    createAdminClient().from("litmus_market").select("*, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId),
    loadFixedText("kaiten_steps"),
  ]);
  if (!c) notFound();
  const kaiten = [1, 2, 3, 4, 5].map((n, i) => ({ n, label: kaitenText.split("\n").map((s) => s.trim()).filter(Boolean)[i] ?? "" }));
  const list = rows ?? [];
  const nBy = new Map(((niche ?? []) as unknown as N[]).map((n) => [n.row_id, n]));
  const mk = (who: string) => new Map(((market ?? []) as unknown as M[]).filter((m) => m.scored_by === who).map((m) => [m.row_id, m]));
  const mine = mk("customer"), ai = mk("ai"), op = mk("operator");
  const hold = (id: string) => { const n = nBy.get(id); return !!n && n.q1_pain_urgency === false && n.q2_actively_seeking === false; };
  const opScored = list.filter((r) => op.has(r.id)).length;
  const cuScored = list.filter((r) => mine.has(r.id)).length;
  const confirmed = list.filter((r) => r.rank != null).length;
  // 一覧：仮順位 → ベレネッツ合計 → 御社合計 の順
  const summary = [...list].sort((a, b) => {
    const ra = num(op.get(a.id)?.rank), rb = num(op.get(b.id)?.rank);
    if (ra !== null || rb !== null) return (ra ?? 9999) - (rb ?? 9999);
    return (num(op.get(b.id)?.total) ?? -1) - (num(op.get(a.id)?.total) ?? -1) || (num(mine.get(b.id)?.total) ?? -1) - (num(mine.get(a.id)?.total) ?? -1) || a.seq - b.seq;
  });
  const before = !["week6_8", "extended", "grace", "advisor", "locked"].includes(c.status);
  const inp = "border-b hairline py-1 bg-transparent";

  return (
    <div>
      <ClearQuery keys={["error", "notice"]} />
      <p className="text-xs text-ink-3"><Link href={`/admin/${c.id}`} className="hover:text-ink">{c.name}</Link> / 選ばれる理由の見極め（ベレネッツの採点）</p>
      <h1 className="serif text-[28px] leading-tight mt-1">選ばれる理由の見極め：ベレネッツの採点</h1>
      <p className="text-sm text-ink-2 mt-2 max-w-[44em]">
        {STATUS_LABEL[c.status]} · 組 {list.length} · 御社の自己評価 {cuScored}/{list.length} · ベレネッツの採点 {opScored}/{list.length} · お客様のシートに確定した順位 {confirmed}組
      </p>
      <p className="text-xs text-ink-3 mt-1 max-w-[44em]">
        {before ? "ベレネッツの点数・回天のステップ・仮順位は、確認セッション②で状態が「仕上げ」になるまでお客様に見えません。" : "状態が「仕上げ」以降なので、ベレネッツの◎○△×はお客様の画面にも出ています（回天のステップと仮順位は出ません）。"}
        回天のステップはお客様には一切出ません。
      </p>
      {mErr && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[44em]">読み込めませんでした：{mErr.message}</p>}
      {err && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[44em]">{err}</p>}
      {notice && <p className="mt-4 rounded-[var(--radius)] bg-navy-soft px-4 py-3 text-sm max-w-[44em]">{notice}</p>}

      {/* 順位の一覧 */}
      <section className="mt-8 max-w-[1100px]">
        <h2 className="serif text-[18px]">順位の一覧</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-[11px] text-ink-3 text-left">
              <tr className="border-b hairline">
                <th className="py-1.5 pr-2 font-normal">仮順位</th>
                <th className="py-1.5 pr-2 font-normal">確定</th>
                <th className="py-1.5 pr-2 font-normal">組</th>
                <th className="py-1.5 pr-2 font-normal whitespace-nowrap">ベレネッツ</th>
                <th className="py-1.5 pr-2 font-normal whitespace-nowrap">御社</th>
                <th className="py-1.5 pr-2 font-normal whitespace-nowrap">AI</th>
                <th className="py-1.5 pr-2 font-normal whitespace-nowrap">回天</th>
                <th className="py-1.5 font-normal">2問</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              {summary.map((r) => {
                const o = op.get(r.id), m = mine.get(r.id), a = ai.get(r.id), n = nBy.get(r.id);
                const ot = o ? marketTotal(o as never) : null;
                return (
                  <tr key={r.id} className={hold(r.id) ? "opacity-60" : ""}>
                    <td className="py-1.5 pr-2 num">{num(o?.rank) ?? "—"}</td>
                    <td className="py-1.5 pr-2 num text-ink-3">{r.rank ?? "—"}</td>
                    <td className="py-1.5 pr-2"><a href={`#r-${r.id}`} className="hover:underline"><span className="num text-ink-3 mr-1.5">{r.seq}</span>{r.value_raw}</a></td>
                    <td className="py-1.5 pr-2 num whitespace-nowrap">{o && ot?.filled ? <>{num(o.total)}<span className="text-ink-3 text-[11px]">（{ot.filled}軸{num(o.magnitude_score) !== null ? "＋大きさ" : ""}）</span></> : <span className="text-warm">未</span>}</td>
                    <td className="py-1.5 pr-2 num whitespace-nowrap">{m ? `${marketTotal(m as never).total}/${AXES_MAX}` : <span className="text-ink-3">未</span>}</td>
                    <td className="py-1.5 pr-2 num whitespace-nowrap text-ink-3">{a ? marketTotal(a as never).total : "—"}</td>
                    <td className="py-1.5 pr-2 num whitespace-nowrap">{num(o?.kaiten_step) ?? "—"}</td>
                    <td className="py-1.5 whitespace-nowrap text-[12px]">{hold(r.id) ? <span className="font-semibold">保留候補</span> : n && (n.q1_pain_urgency !== null || n.q2_actively_seeking !== null) ? `${yn(n.q1_pain_urgency)}／${yn(n.q2_actively_seeking)}` : <span className="text-ink-3">未回答</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-ink-3 mt-2">ベレネッツの合計＝{MARKET_AXES.length}軸（各◎3〜×0）＋大きさ（◎3〜×0）。御社は{MARKET_AXES.length}軸のみ。2問が「はい／いいえ」の順は、切実さ／自分から探しているか。</p>
        <div className="mt-4 flex flex-wrap gap-3 items-start">
          <form action={autoRank}>
            <input type="hidden" name="company_id" value={c.id} />
            <button type="submit" className="rounded-[var(--radius)] border-2 border-navy bg-paper text-navy px-4 py-2 text-[14px] font-semibold hover:bg-navy-soft transition-colors">合計点の高い順に仮順位を入れる</button>
            <p className="text-[11px] text-ink-3 mt-1 max-w-[22em]">保留候補と未採点の組は順位から外します。入れたあと、組ごとに手で直せます。</p>
          </form>
          <form action={confirmRanking}>
            <input type="hidden" name="company_id" value={c.id} />
            <button type="submit" className="btn-primary">仮順位をお客様のシートに確定する</button>
            <p className="text-[11px] text-ink-3 mt-1 max-w-[26em]">確認セッション②で順位を決めてから押してください。押すと、お客様のシートとExcel出力に「順位」が出て、1位が主役の組になります。何度でも押し直せます。</p>
          </form>
        </div>
      </section>

      {/* 組ごとの採点 */}
      <section className="mt-12 max-w-[1100px]">
        <h2 className="serif text-[18px]">組ごとの採点</h2>
        {list.length === 0 && <p className="text-sm text-ink-3 mt-3">まだ組がありません。</p>}
        <ol className="mt-4 space-y-6">
          {list.map((r) => {
            const n = nBy.get(r.id), m = mine.get(r.id), a = ai.get(r.id), o = op.get(r.id);
            const exp = r.experience_value ?? r.experience_value_v1;
            return (
              <li key={r.id} id={`r-${r.id}`} className={`scroll-mt-6 rounded-[var(--radius)] border hairline overflow-hidden ${hold(r.id) ? "opacity-70" : ""}`}>
                <div className="bg-paper-2 px-5 py-3">
                  <p className="serif text-[16px] leading-snug"><span className="num text-xs text-ink-3 mr-2">{r.seq}</span><span className="text-[11px] text-ink-3 font-normal mr-1.5">御社は</span>{r.value_raw}</p>
                  {exp && <p className="text-[13px] text-ink-2 mt-0.5"><span className="text-[11px] text-ink-3 mr-1.5">だから、お客様は</span>{exp}</p>}
                  {r.because_phrase && <p className="text-[13px] text-ink-2 mt-0.5"><span className="text-[11px] text-ink-3 mr-1.5">なぜなら</span>{r.because_phrase}</p>}
                </div>
                <form action={saveOperatorScore} className="px-5 py-4 grid gap-6 lg:grid-cols-[1fr_1fr]">
                  <input type="hidden" name="company_id" value={c.id} />
                  <input type="hidden" name="row_id" value={r.id} />
                  <div className="space-y-4">
                    <div>
                      <p className="text-[12px] font-semibold text-ink-2">見込み客の切実さ（2問・御社の答え）</p>
                      <ul className="mt-1.5 space-y-1 text-[13px]">
                        {NICHE_QUESTIONS.map((qq) => (
                          <li key={qq.key} className="leading-snug">
                            <span className="text-ink-2">{qq.text}</span>
                            <span className="block text-[12px]">御社：<strong>{yn(n ? (n[qq.col] as boolean | null) : null)}</strong>{n?.ai_note ? <span className="text-ink-3 ml-3">AI：{yn(n[qq.ai] as boolean | null)}</span> : null}</span>
                          </li>
                        ))}
                      </ul>
                      {n?.ai_note && <p className="text-[11px] text-ink-3 mt-1">AIの見立て：{n.ai_note}</p>}
                      {hold(r.id) && <p className="text-[12px] mt-1 font-semibold">2問とも「いいえ」：保留候補</p>}
                    </div>
                    <div className="text-[13px]">
                      <p className="text-[12px] font-semibold text-ink-2">御社のメモ</p>
                      <p className="mt-1"><span className="text-[11px] text-ink-3">大きさ：</span>{m?.magnitude_text || <span className="text-ink-3">—</span>}</p>
                      <p className="mt-0.5"><span className="text-[11px] text-ink-3">手の入れ方：</span>{m?.zougenjofu || <span className="text-ink-3">—</span>}</p>
                    </div>
                    <label className="block text-[13px]"><span className="text-[11px] text-ink-3">ベレネッツの見立て：大きさ（金額か件数）</span>
                      <input name="magnitude_text" defaultValue={o?.magnitude_text ?? ""} maxLength={500} className={`w-full ${inp}`} /></label>
                    <label className="block text-[13px]"><span className="text-[11px] text-ink-3">増減除付（増・減・除・付のどれか＋一言）</span>
                      <textarea name="zougenjofu" defaultValue={o?.zougenjofu ?? ""} rows={2} maxLength={1000} className={`w-full ${inp}`} /></label>
                  </div>

                  <div className="space-y-3">
                    <table className="w-full text-[13px]">
                      <thead className="text-[11px] text-ink-3">
                        <tr><th className="text-left font-normal py-1">軸</th><th className="font-normal">AI</th><th className="font-normal">御社</th><th className="font-normal text-navy">ベレネッツ</th></tr>
                      </thead>
                      <tbody className="divide-y divide-hair">
                        {MARKET_AXES.map((ax) => {
                          const av = num(a?.[ax.key]), mv = num(m?.[ax.key]), ov = num(o?.[ax.key]);
                          return (
                            <tr key={ax.key}>
                              <td className="py-1.5 pr-2"><span title={ax.hint}>{ax.label}</span></td>
                              <td className="py-1.5 text-center text-ink-3">{av === null ? "—" : MARK_LABEL[av]}</td>
                              <td className="py-1.5 text-center">{mv === null ? "—" : MARK_LABEL[mv]}</td>
                              <td className="py-1.5 text-center">
                                <select name={ax.key} defaultValue={ov === null ? "" : String(ov)} className={inp}>
                                  <option value="">—</option>
                                  {MARKS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td className="py-1.5 pr-2">大きさ（マグニチュード）</td>
                          <td className="py-1.5 text-center text-ink-3">—</td>
                          <td className="py-1.5 text-center text-ink-3 text-[11px]">メモのみ</td>
                          <td className="py-1.5 text-center">
                            <select name="magnitude_score" defaultValue={num(o?.magnitude_score) === null ? "" : String(num(o?.magnitude_score))} className={inp}>
                              <option value="">—</option>
                              {MARKS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
                            </select>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="flex flex-wrap gap-6 text-[13px]">
                      <label><span className="text-[11px] text-ink-3 block">回天のステップ（お客様には出ません）</span>
                        <select name="kaiten_step" defaultValue={num(o?.kaiten_step) === null ? "" : String(num(o?.kaiten_step))} className={inp}>
                          <option value="">—</option>
                          {kaiten.map((k) => <option key={k.n} value={k.n}>{`STEP ${k.n}${k.label ? `　${k.label}` : ""}`}</option>)}
                        </select>
                      </label>
                      <label><span className="text-[11px] text-ink-3 block">仮順位</span>
                        <input name="rank" type="number" min={1} max={999} defaultValue={num(o?.rank) ?? ""} className={`${inp} w-20 num`} />
                      </label>
                    </div>
                    <button type="submit" className="btn-primary">この組の採点を保存</button>
                  </div>
                </form>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
