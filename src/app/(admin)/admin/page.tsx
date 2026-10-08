import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { STATUS_LABEL } from "@/lib/stages";
import { createCompany } from "./actions";

export default async function AdminHome() {
  const { supabase } = await requireOperator();
  const { data: companies } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
  const ids = (companies ?? []).map((c) => c.id);
  const [{ data: last }, { data: hw }, { data: alerts }, { data: qs }, { data: errs }] = await Promise.all([
    supabase.from("activity_log").select("company_id, created_at").in("company_id", ids).order("created_at", { ascending: false }),
    supabase.from("homeworks").select("company_id").in("company_id", ids).eq("status", "open"),
    supabase.from("alerts").select("company_id, kind").in("company_id", ids).is("resolved_at", null),
    supabase.from("questions_to_operator").select("company_id, read_at, answered_at").in("company_id", ids),
    supabase.from("error_reports").select("company_id, read_at, resolved_at").in("company_id", ids),
  ]);
  const msg: Record<string, { unread: number; unanswered: number; errUnread: number; errOpen: number }> = {};
  const m = (id: string) => (msg[id] ??= { unread: 0, unanswered: 0, errUnread: 0, errOpen: 0 });
  for (const q of qs ?? []) { if (!q.read_at) m(q.company_id).unread++; if (!q.answered_at) m(q.company_id).unanswered++; }
  for (const e of errs ?? []) { if (!e.read_at) m(e.company_id).errUnread++; if (!e.resolved_at) m(e.company_id).errOpen++; }
  const totalUnanswered = Object.values(msg).reduce((a, x) => a + x.unanswered, 0);
  const totalErrOpen = Object.values(msg).reduce((a, x) => a + x.errOpen, 0);
  const lastBy: Record<string, string> = {};
  for (const l of last ?? []) if (!lastBy[l.company_id]) lastBy[l.company_id] = l.created_at;
  const hwBy: Record<string, number> = {};
  for (const h of hw ?? []) hwBy[h.company_id] = (hwBy[h.company_id] ?? 0) + 1;
  const alBy: Record<string, string[]> = {};
  for (const a of alerts ?? []) (alBy[a.company_id] ??= []).push(a.kind);

  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">全社一覧</h1>
      {(totalUnanswered > 0 || totalErrOpen > 0) && (
        <p className="mt-4 inline-flex items-center gap-3 rounded-[var(--radius)] bg-warm-soft px-4 py-2.5 text-sm">
          <span className="font-semibold text-warm">返事待ち</span>
          {totalUnanswered > 0 && <span>質問 <span className="num font-semibold">{totalUnanswered}</span> 件</span>}
          {totalErrOpen > 0 && <span>エラーレポート <span className="num font-semibold">{totalErrOpen}</span> 件</span>}
          <span className="text-ink-3 text-[12px]">返事が遅れると、顧客のやる気が下がります</span>
        </p>
      )}
      <table className="mt-8 w-full text-sm">
        <thead className="text-xs text-ink-3 text-left">
          <tr><th className="py-2 font-normal">会社</th><th className="font-normal">状態</th><th className="font-normal">最終操作</th><th className="font-normal">質問</th><th className="font-normal">エラー</th><th className="font-normal">未回収宿題</th><th className="font-normal">アラート</th></tr>
        </thead>
        <tbody className="divide-y hairline">
          {(companies ?? []).map((c) => {
            const lastAt = lastBy[c.id] ? new Date(lastBy[c.id]) : null;
            const stale = lastAt ? (Date.now() - lastAt.getTime()) / 86400000 : null;
            return (
              <tr key={c.id} className={stale !== null && stale >= 7 ? "bg-[#fff8e5]" : ""}>
                <td className="py-3"><Link href={`/admin/${c.id}`} className="hover:underline">{c.name}</Link></td>
                <td>{STATUS_LABEL[c.status] ?? c.status}</td>
                <td className="num">{lastAt ? `${Math.floor(stale!)}日前` : "—"}</td>
                <td>
                  {msg[c.id]?.unanswered ? (
                    <span className="inline-flex items-center gap-1.5">
                      {msg[c.id].unread > 0 && <span className="num rounded-full bg-warm text-white text-[11px] font-semibold px-2 py-0.5">未読 {msg[c.id].unread}</span>}
                      <span className="num rounded-full border border-warm text-warm text-[11px] font-semibold px-2 py-0.5">未返信 {msg[c.id].unanswered}</span>
                    </span>
                  ) : <span className="text-ink-3">—</span>}
                </td>
                <td>
                  {msg[c.id]?.errOpen ? (
                    <span className="inline-flex items-center gap-1.5">
                      {msg[c.id].errUnread > 0 && <span className="num rounded-full bg-warm text-white text-[11px] font-semibold px-2 py-0.5">未読 {msg[c.id].errUnread}</span>}
                      <span className="num rounded-full border border-warm text-warm text-[11px] font-semibold px-2 py-0.5">未対応 {msg[c.id].errOpen}</span>
                    </span>
                  ) : <span className="text-ink-3">—</span>}
                </td>
                <td className="num">{hwBy[c.id] ?? 0}</td>
                <td className="text-xs text-ink-2">{(alBy[c.id] ?? []).join(", ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <form action={createCompany} className="mt-12 flex gap-3 items-end max-w-md">
        <label className="flex-1">
          <span className="text-xs text-ink-2">新しい会社</span>
          <input name="name" required className="block w-full border-b hairline py-2" />
        </label>
        <button className="btn-primary" type="submit">追加</button>
      </form>
    </div>
  );
}
