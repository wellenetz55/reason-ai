import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { STATUS_LABEL } from "@/lib/stages";
import { createCompany } from "./actions";

export default async function AdminHome() {
  const { supabase } = await requireOperator();
  const { data: companies } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
  const ids = (companies ?? []).map((c) => c.id);
  const [{ data: last }, { data: hw }, { data: alerts }] = await Promise.all([
    supabase.from("activity_log").select("company_id, created_at").in("company_id", ids).order("created_at", { ascending: false }),
    supabase.from("homeworks").select("company_id").in("company_id", ids).eq("status", "open"),
    supabase.from("alerts").select("company_id, kind").in("company_id", ids).is("resolved_at", null),
  ]);
  const lastBy: Record<string, string> = {};
  for (const l of last ?? []) if (!lastBy[l.company_id]) lastBy[l.company_id] = l.created_at;
  const hwBy: Record<string, number> = {};
  for (const h of hw ?? []) hwBy[h.company_id] = (hwBy[h.company_id] ?? 0) + 1;
  const alBy: Record<string, string[]> = {};
  for (const a of alerts ?? []) (alBy[a.company_id] ??= []).push(a.kind);

  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">全社一覧</h1>
      <table className="mt-8 w-full text-sm">
        <thead className="text-xs text-ink-3 text-left">
          <tr><th className="py-2 font-normal">会社</th><th className="font-normal">状態</th><th className="font-normal">最終操作</th><th className="font-normal">未回収宿題</th><th className="font-normal">アラート</th></tr>
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
