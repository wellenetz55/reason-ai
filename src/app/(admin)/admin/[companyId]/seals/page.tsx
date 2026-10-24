import { notFound } from "next/navigation";
import Link from "next/link";
import { ClearQuery } from "@/components/ClearQuery";
import { requireOperator } from "@/lib/session";
import { STATUS_LABEL } from "@/lib/stages";
import { SEAL_SESSIONS, SEAL_LABEL } from "@/lib/seals";
import { fmtMeeting } from "@/lib/meetings";
import { createAdminClient } from "@/lib/supabase/admin";
import { sealSession, unsealSession } from "./actions";

const COLUMN_LABEL: Record<string, string> = {
  "sheet_rows.target": "ターゲット", "sheet_rows.value_raw": "提供価値", "sheet_rows.experience_value_v1": "体験価値（STEP 1）", "sheet_rows.status": "組を外す・保留",
  "brakes.customer_words": "ブレーキ", "brakes.counter_message": "先回りの答え", "brakes.because": "答えの根拠", "brakes.status": "ブレーキを外す",
  "sheet_rows.experience_value": "体験価値（STEP 5）", "sheet_rows.because_phrase": "なぜなら", "sheet_rows.rank": "順位", "evidences.*": "証拠",
  "litmus_niche.answer": "見込み客の切実さ（2問）", "litmus_market.score": "市場で通用するか（御社の点数）",
};

/** 封（確認セッション①②③）：封をする・解く、封をブロックする条件の警告、封をした列の変更の記録 */
export default async function SealsAdmin({ params, searchParams }: PageProps<"/admin/[companyId]/seals">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const err = typeof sp?.error === "string" ? sp.error : null;
  const notice = typeof sp?.notice === "string" ? sp.notice : null;
  const { supabase } = await requireOperator();
  const [{ data: c }, { data: locks }, { data: top }] = await Promise.all([
    supabase.from("companies").select("id, name, status").eq("id", companyId).maybeSingle(),
    supabase.from("sheet_locks").select("id, session, locked_at, is_provisional, columns").eq("company_id", companyId),
    supabase.from("sheet_rows").select("id, seq, value_raw, because_phrase, because_tag, rank").eq("company_id", companyId).eq("status", "active").eq("rank", 1).maybeSingle(),
  ]);
  if (!c) notFound();
  const lockIds = (locks ?? []).map((l) => l.id);
  const [{ data: hist }, { data: topBrakes }] = await Promise.all([
    lockIds.length ? createAdminClient().from("sheet_lock_history").select("id, lock_id, row_id, column_key, before_text, after_text, reason, changed_at").in("lock_id", lockIds).order("changed_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] as { id: string; lock_id: string; row_id: string | null; column_key: string; before_text: string | null; after_text: string | null; reason: string | null; changed_at: string }[] }),
    top ? supabase.from("brakes").select("because_tag, counter_message").eq("row_id", top.id).eq("status", "active") : Promise.resolve({ data: [] as { because_tag: string; counter_message: string | null }[] }),
  ]);
  // 記録がどの組のものか分かるように、組の番号を引く
  const histRowIds = [...new Set((hist ?? []).map((h) => h.row_id).filter((x): x is string => !!x))];
  const { data: histRows } = histRowIds.length ? await supabase.from("sheet_rows").select("id, seq").in("id", histRowIds) : { data: [] as { id: string; seq: number }[] };
  const seqOf = new Map((histRows ?? []).map((r) => [r.id, r.seq]));
  const bySession = new Map((locks ?? []).map((l) => [l.session as string, l]));
  const lockSession = new Map((locks ?? []).map((l) => [l.id, l.session as string]));
  // 仕様 00 §5：⑤⑥の根拠が「事実」1件もない行を1位にしようとしている（警告のみ。強制はしない）
  const topFacts = top ? (top.because_tag === "fact" ? 1 : 0) + (topBrakes ?? []).filter((b) => b.counter_message && b.because_tag === "fact").length : 0;

  return (
    <div>
      <ClearQuery keys={["error", "notice"]} />
      <p className="text-xs text-ink-3"><Link href={`/admin/${c.id}`} className="hover:text-ink">{c.name}</Link> / 封</p>
      <h1 className="serif text-[28px] leading-tight mt-1">封（確認セッションで確定した言葉）</h1>
      <p className="text-sm text-ink-2 mt-2 max-w-[44em]">{STATUS_LABEL[c.status]} · 封をした列は、封の時点で既にあった組・ブレーキについて、お客様が「変更の理由」を書いたときだけ直せます。理由と変更前後は下の記録に残ります。封のあとに足した組や、根拠が「事実」でない主張（仮封）は理由なしで直せます。状態の前進は、これまでどおり面談を「実施済」にしたときに行います。</p>
      {err && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[44em]">{err}</p>}
      {notice && <p className="mt-4 rounded-[var(--radius)] bg-navy-soft px-4 py-3 text-sm max-w-[44em]">{notice}</p>}

      <ol className="mt-8 space-y-5 max-w-[880px]">
        {SEAL_SESSIONS.map((s) => {
          const l = bySession.get(s.key);
          return (
            <li key={s.key} className={`rounded-[var(--radius)] border px-5 py-4 ${l ? "border-navy/40 bg-navy-soft" : "hairline"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="serif text-[18px]">{s.label}</h2>
                {l ? <span className="text-[13px] text-navy font-semibold">封済み <span className="num font-normal">{fmtMeeting(l.locked_at)}</span>{l.is_provisional ? "（仮封）" : ""}</span> : <span className="text-[13px] text-ink-3">まだ封をしていません</span>}
              </div>
              <p className="text-[13px] text-ink-2 mt-1">対象：{s.what}</p>
              <p className="text-[11px] text-ink-3 mt-0.5">列：{s.columns.map((k) => COLUMN_LABEL[k] ?? k).join("・")}</p>
              {s.key === "s2" && (
                top ? (
                  topFacts === 0
                    ? <p className="mt-2 text-[13px] text-warm font-semibold">注意：1位の組（No.{top.seq}「{top.value_raw}」）には、根拠が「事実」の「なぜなら」・答えが1件もありません。このまま1位として封をしてよいか、確かめてください。</p>
                    : <p className="mt-2 text-[12px] text-ink-3">1位の組：No.{top.seq}「{top.value_raw}」（根拠が事実の主張 {topFacts}件）</p>
                ) : <p className="mt-2 text-[13px] text-warm">1位の組がまだ確定していません（「選ばれる理由の見極め」で順位を確定してから封をしてください）。</p>
              )}
              <div className="mt-3 flex flex-wrap gap-3 items-center">
                <form action={sealSession}>
                  <input type="hidden" name="company_id" value={c.id} /><input type="hidden" name="session" value={s.key} />
                  <button className="btn-primary" type="submit">{l ? "いまの内容で封をし直す" : `${s.label}の封をする`}</button>
                </form>
                {l && (
                  <form action={unsealSession} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="company_id" value={c.id} /><input type="hidden" name="session" value={s.key} />
                    <label className="text-[11px] text-ink-3 flex items-center gap-1"><input type="checkbox" name="confirm" value="yes" required />変更の記録も消えることを確認しました</label>
                    <button className="btn-text text-xs" type="submit">封を解く</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <section className="mt-12 max-w-[1100px]">
        <h2 className="serif text-[18px]">封をした列の変更の記録（新しい順・最大50件）</h2>
        {(hist ?? []).length === 0 ? <p className="text-sm text-ink-3 mt-3">まだありません。</p> : (
          <ul className="mt-3 divide-y divide-hair text-[13px]">
            {(hist ?? []).map((h) => (
              <li key={h.id} className="py-3">
                <p className="text-[11px] text-ink-3"><span className="num">{fmtMeeting(h.changed_at)}</span> · {SEAL_LABEL[lockSession.get(h.lock_id) ?? ""] ?? ""} · {h.row_id && seqOf.has(h.row_id) ? <span className="num">組 No.{seqOf.get(h.row_id)} · </span> : null}{COLUMN_LABEL[h.column_key] ?? h.column_key}</p>
                <p className="mt-1"><span className="text-ink-3 mr-1">前：</span>{h.before_text || "（空）"}</p>
                <p><span className="text-ink-3 mr-1">後：</span>{h.after_text || "（空）"}</p>
                <p className="mt-0.5 text-navy"><span className="text-ink-3 mr-1">理由：</span>{h.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
