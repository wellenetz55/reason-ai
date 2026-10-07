export const instant = false;
import Link from "next/link";
import { requireCustomer } from "@/lib/session";
import { STAGES, STATUS_LABEL, isStageOpen } from "@/lib/stages";
import { signOut } from "@/app/login/actions";
import { NavRail } from "@/components/NavRail";
import { ReasonLogo, OperatedBy } from "@/components/Brand";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { company, profile, supabase } = await requireCustomer();
  const [{ count: openHomework }, { data: nextMeeting }] = await Promise.all([
    supabase.from("homeworks").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "open"),
    supabase
      .from("company_meetings")
      .select("kind, scheduled_at")
      .eq("company_id", company.id)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(1)
      .maybeSingle(),
  ]);

  const stages = STAGES.map((s) => ({ ...s, open: isStageOpen(s, company.status) }));

  return (
    <div className="flex-1 flex min-h-screen">
      <aside className="w-[232px] shrink-0 border-r hairline px-6 py-8 flex flex-col">
        <Link href="/" className="block"><ReasonLogo width={150} /></Link>
        <p className="serif text-[15px] leading-snug mt-6">{company.name}</p>
        <p className="text-xs text-ink-3 mt-1">{STATUS_LABEL[company.status] ?? company.status}</p>
        <NavRail stages={stages} />
        <div className="mt-auto pt-8 text-xs text-ink-2 space-y-2">
          {nextMeeting && (
            <p>
              次の面談 <span className="num">{new Date(nextMeeting.scheduled_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
            </p>
          )}
          <p>
            <Link href="/homework" className="hover:text-ink">宿題 <span className="num">{openHomework ?? 0}</span></Link>
          </p>
          <p>
            <Link href="/ask" className="hover:text-ink">ベレネッツに質問を残す</Link>
          </p>
          <form action={signOut}>
            <button className="text-ink-3 hover:text-ink" type="submit">{profile.display_name ?? "サインアウト"}</button>
          </form>
          <OperatedBy className="pt-4" />
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-10 py-10">
        <div className="max-w-[960px]">{children}</div>
      </main>
    </div>
  );
}
