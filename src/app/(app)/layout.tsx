export const instant = false;
import Link from "next/link";
import { requireCustomer } from "@/lib/session";
import { STAGES, STATUS_LABEL, isStageOpen, currentStep } from "@/lib/stages";
import { signOut } from "@/app/login/actions";
import { NavRail } from "@/components/NavRail";
import { ReasonLogo, OperatedBy } from "@/components/Brand";
import { APP_VERSION } from "@/lib/version";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { company, profile, supabase } = await requireCustomer();
  const [{ count: openHomework }, { data: nextMeeting }, { data: progress }] = await Promise.all([
    supabase.from("homeworks").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "open"),
    supabase
      .from("company_meetings")
      .select("kind, scheduled_at")
      .eq("company_id", company.id)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(1)
      .maybeSingle(),
    supabase.from("v_divergence_progress").select("row_count").eq("company_id", company.id).maybeSingle(),
  ]);

  const nowKey = currentStep(company.status, progress?.row_count ?? 0).key;
  const stages = STAGES.map((s) => ({ ...s, open: isStageOpen(s, company.status), now: s.key === nowKey }));

  return (
    <div className="flex-1 flex min-h-screen">
      <aside className="w-[260px] shrink-0 border-r hairline px-6 py-8 flex flex-col">
        <Link href="/" className="block"><ReasonLogo width={150} /></Link>
        <p className="serif text-[16px] leading-snug mt-6">{company.name}</p>
        <p className="text-[13px] text-ink-3 mt-1">{STATUS_LABEL[company.status] ?? company.status}</p>
        <NavRail stages={stages} />
        <Link href="/ask" className="btn-primary mt-8 block text-center">ベレネッツに質問を残す</Link>
        <div className="mt-auto pt-8 text-[13px] text-ink-2 space-y-2">
          {nextMeeting && (
            <p>
              次の面談 <span className="num">{new Date(nextMeeting.scheduled_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}</span>
            </p>
          )}
          <p>
            <Link href="/homework" className="hover:text-ink">宿題 <span className="num">{openHomework ?? 0}</span></Link>
          </p>
          <form action={signOut} className="pt-2">
            <p className="text-ink-2 mb-1">{profile.display_name}</p>
            <button className="text-ink-3 hover:text-ink" type="submit">サインアウト</button>
          </form>
          <OperatedBy className="pt-4" />
          <p className="num text-[11px] text-ink-3">{APP_VERSION}</p>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-10 py-10">
        <div className="max-w-[960px]">{children}</div>
      </main>
    </div>
  );
}
