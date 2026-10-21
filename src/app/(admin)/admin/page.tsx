import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { STATUS_LABEL } from "@/lib/stages";
import { createCompany } from "./actions";

export default async function AdminHome() {
  const { supabase } = await requireOperator();
  const { data: companies } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
  const ids = (companies ?? []).map((c) => c.id);
  // 最終操作は、会社ごとにお客様の操作だけで数える（AIのエラー記録・ベレネッツ側の操作は含めない）
  // まず新しい操作をまとめて1回で読み、そこに出てこなかった会社だけ個別に探す（会社が増えても往復が増えにくい）
  const custOnly = <Q extends { not: (c: string, o: string, v: string) => Q }>(q: Q) => q.not("event", "like", "%.error").not("event", "like", "intake.%");
  const { data: recent } = await custOnly(supabase.from("activity_log").select("company_id, created_at").in("company_id", ids)).order("created_at", { ascending: false }).limit(1000);
  const seen = new Set((recent ?? []).map((r) => r.company_id));
  const rest = await Promise.all(ids.filter((id) => !seen.has(id)).map((id) =>
    custOnly(supabase.from("activity_log").select("company_id, created_at").eq("company_id", id)).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ));
  const last = [...(recent ?? []), ...rest.map((r) => r.data).filter((r): r is { company_id: string; created_at: string } => !!r)];
  const [{ data: hw }, { data: alerts }, { data: qs }, { data: errs }] = await Promise.all([
    supabase.from("homeworks").select("company_id").in("company_id", ids).eq("status", "open"),
    supabase.from("alerts").select("company_id, kind, payload, created_at").in("company_id", ids).is("resolved_at", null).order("created_at", { ascending: false }),
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
  for (const l of last) if (!lastBy[l.company_id]) lastBy[l.company_id] = l.created_at;
  const hwBy: Record<string, number> = {};
  for (const h of hw ?? []) hwBy[h.company_id] = (hwBy[h.company_id] ?? 0) + 1;
  const ALERT: Record<string, string> = { stale7: "7日操作なし", no_internal_meeting: "社内打合せ未登録", homework_overdue: "宿題の期限超過", attitude_flag: "姿勢シグナル", disclosure_request: "開示要求", quota_reached: "生成上限", grace_ending: "猶予終了間近", extension_ending: "延長終了間近", escalation: "要対応" };
  const fmtD = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
  // 会社ごとに、同じ内容はまとめて件数表示。新しい順
  const alBy: Record<string, { label: string; count: number; at: string; urgent: boolean }[]> = {};
  for (const a of alerts ?? []) {
    // 「7日操作なし」は、その後に操作があれば表示しない（毎朝の処理が済みにするまでの間のずれを消す）
    if (a.kind === "stale7" && lastBy[a.company_id] && Date.now() - new Date(lastBy[a.company_id]).getTime() < 7 * 86400000) continue;
    const p = (a.payload ?? {}) as { type?: string; date?: string };
    const label = p.type === "kickoff_chosen" && p.date ? `キックオフ日が選ばれました ${fmtD(p.date)}` : p.type === "program_applied" ? "申込がありました（契約書・請求書を送付）" : p.type === "step2_done" ? "まとめて絞るが終わりました（確認セッション①の日程を決める）" : p.type === "diagnosis_viewed" ? "診断結果を開きました" : ALERT[a.kind] ?? a.kind;
    const urgent = p.type === "program_applied" || p.type === "kickoff_chosen" || p.type === "step2_done" || a.kind === "disclosure_request" || a.kind === "quota_reached";
    const list = (alBy[a.company_id] ??= []);
    const hit = list.find((x) => x.label === label);
    if (hit) hit.count += 1; else list.push({ label, count: 1, at: a.created_at, urgent });
  }

  // 状態ごとにまとめ、各まとまりの中は「返事待ち → 急ぎのアラート → 新しい順」に並べる（会社が増えても、先に見るべき会社が上に来る）
  type Company = NonNullable<typeof companies>[number];
  const GROUPS = [
    { key: "active", label: "プログラム進行中", st: ["onboarding", "week1_2", "week3_5", "week6_8", "extended"] },
    { key: "pre", label: "契約前（適合診断）", st: ["diagnosed"] },
    { key: "after", label: "猶予期間・顧問", st: ["grace", "advisor"] },
    { key: "ended", label: "終了（ダウンロードのみ・解約）", st: ["locked", "cancelled"] },
  ] as const;
  const isWaiting = (id: string) => (msg[id]?.unanswered ?? 0) + (msg[id]?.errOpen ?? 0) > 0;
  const isUrgent = (id: string) => (alBy[id] ?? []).some((x) => x.urgent);
  const rank = (c: Company) => (isWaiting(c.id) ? 0 : isUrgent(c.id) ? 1 : 2);
  const grouped: Record<string, Company[]> = Object.fromEntries(GROUPS.map((g) => [g.key, [] as Company[]]));
  for (const c of companies ?? []) (grouped[GROUPS.find((g) => (g.st as readonly string[]).includes(c.status))?.key ?? "active"]).push(c);
  for (const k in grouped) grouped[k].sort((a, b) => rank(a) - rank(b));

  const renderRow = (c: Company) => {
            const lastAt = lastBy[c.id] ? new Date(lastBy[c.id]) : null;
            const stale = lastAt ? (Date.now() - lastAt.getTime()) / 86400000 : null;
            const waiting = (msg[c.id]?.unanswered ?? 0) + (msg[c.id]?.errOpen ?? 0) > 0;
            return (
              <tr key={c.id} className={`align-top ${stale !== null && stale >= 7 && ["onboarding", "week1_2", "week3_5", "week6_8", "extended"].includes(c.status) ? "bg-warm-soft" : ""}`}>
                <td className={`py-3 pl-3 pr-4 min-w-[200px] border-l-4 ${waiting ? "border-warm" : "border-transparent"}`}>
                  <Link href={`/admin/${c.id}`} className={`hover:underline ${waiting ? "font-semibold" : ""}`}>{c.name}</Link>
                  {waiting ? <span className="block text-[11px] text-warm font-semibold mt-0.5">返事待ち</span> : isUrgent(c.id) ? <span className="block text-[11px] text-warm font-semibold mt-0.5">ベレネッツの番</span> : null}
                </td>
                <td className="pr-4 py-3 whitespace-nowrap">{STATUS_LABEL[c.status] ?? c.status}</td>
                <td className="num pr-4 py-3 whitespace-nowrap">{lastAt ? `${Math.floor(stale!)}日前` : "—"}</td>
                <td className="pr-4 py-3">
                  {msg[c.id]?.unanswered ? (
                    <span className="inline-flex items-center gap-1.5">
                      {msg[c.id].unread > 0 && <span className="attention-blink num rounded-full bg-warm text-on-accent text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap">未読 {msg[c.id].unread}</span>}
                      <span className="num rounded-full border border-warm text-warm text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap">未返信 {msg[c.id].unanswered}</span>
                    </span>
                  ) : <span className="text-ink-3">—</span>}
                </td>
                <td className="pr-4 py-3">
                  {msg[c.id]?.errOpen ? (
                    <span className="inline-flex items-center gap-1.5">
                      {msg[c.id].errUnread > 0 && <span className="attention-blink num rounded-full bg-warm text-on-accent text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap">未読 {msg[c.id].errUnread}</span>}
                      <span className="num rounded-full border border-warm text-warm text-[11px] font-semibold px-2 py-0.5 whitespace-nowrap">未対応 {msg[c.id].errOpen}</span>
                    </span>
                  ) : <span className="text-ink-3">—</span>}
                </td>
                <td className="num pr-4 py-3">{hwBy[c.id] ?? 0}</td>
                <td className="py-3 pr-3 text-xs min-w-[220px]">
                  {(alBy[c.id] ?? []).length === 0 ? <span className="text-ink-3">—</span> : (
                    <ul className="space-y-1">
                      {alBy[c.id].map((x) => (
                        <li key={x.label} className="flex items-baseline gap-2">
                          <span className={`shrink-0 w-1.5 h-1.5 rounded-full translate-y-[-2px] ${x.urgent ? "bg-warm" : "bg-ink-3"}`} />
                          <span className={x.urgent ? "text-warm font-bold" : "text-ink-2"}>{x.label}{x.count > 1 && <span className="num text-ink-3"> ×{x.count}</span>}</span>
                          <span className="num text-ink-3 shrink-0">{fmtD(x.at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          };

  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">全社一覧</h1>
      {(totalUnanswered > 0 || totalErrOpen > 0) && (
        <p role="status" className="mt-4 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-4 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2 font-bold text-warm"><span className="now-dot" aria-hidden /><span className="attention-blink">返事待ち</span></span>
          {totalUnanswered > 0 && <span>質問 <span className="num font-semibold">{totalUnanswered}</span> 件</span>}
          {totalErrOpen > 0 && <span>エラーレポート <span className="num font-semibold">{totalErrOpen}</span> 件</span>}
          <span className="text-ink-3 text-[12px]">返事が遅れると、顧客のやる気が下がります</span>
        </p>
      )}
      {(() => {
        const todo = (companies ?? []).filter((c) => isUrgent(c.id)).map((c) => ({ c, items: (alBy[c.id] ?? []).filter((x) => x.urgent) }));
        if (!todo.length) return null;
        return (
          <section role="status" className="mt-4 rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-5 py-4 text-sm max-w-[760px]">
            <p className="inline-flex items-center gap-2 font-bold text-warm"><span className="now-dot" aria-hidden /><span className="attention-blink">ベレネッツの番</span><span className="num font-semibold text-ink">{todo.length}社</span></p>
            <ul className="mt-2 space-y-1.5">
              {todo.map(({ c, items }) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <Link href={`/admin/${c.id}`} className="font-semibold underline underline-offset-2 hover:text-warm">{c.name}</Link>
                  <span className="text-ink">{items.map((x) => x.label).join("／")}</span>
                  <span className="num text-[11px] text-ink-3">{fmtD(items[0].at)}</span>
                </li>
              ))}
            </ul>
            <p className="text-ink-3 text-[12px] mt-2">顧客側の作業が終わり、次の一手がベレネッツにある会社です。対応すると自動で消えます</p>
          </section>
        );
      })()}
      {(companies ?? []).length === 0 ? (
        <p className="mt-8 rounded-[var(--radius)] bg-paper-2 px-5 py-4 text-sm text-ink-2 max-w-[40em]">まだ会社がありません。いちばん下の「新しい会社」に会社名を入れて追加してください。</p>
      ) : (
      <div className="mt-8 overflow-x-auto">
      <table className="w-full min-w-[1000px] text-sm">
        <thead className="text-xs text-ink-3 text-left whitespace-nowrap">
          <tr><th className="py-2 pl-4 pr-4 font-normal">会社</th><th className="pr-4 font-normal">状態</th><th className="pr-4 font-normal">最終操作</th><th className="pr-4 font-normal">質問</th><th className="pr-4 font-normal">エラー</th><th className="pr-4 font-normal">未回収宿題</th><th className="font-normal">アラート</th></tr>
        </thead>
        <tbody className="divide-y divide-hair">
          {GROUPS.map((g) => {
            const list = grouped[g.key];
            if (!list.length) return null;
            return [
              <tr key={g.key} className="bg-paper-2"><th colSpan={7} className="py-2 pl-4 text-left text-xs font-semibold text-ink-2">{g.label}<span className="num font-normal text-ink-3 ml-2">{list.length}社</span></th></tr>,
              ...list.map(renderRow),
            ];
          })}
        </tbody>
      </table>
      </div>
      )}
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
