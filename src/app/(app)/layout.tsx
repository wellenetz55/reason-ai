export const instant = false;
import Link from "next/link";
import { requireCustomer } from "@/lib/session";
import { STAGES, STATUS_LABEL, isStageOpen, currentStep } from "@/lib/stages";
import { signOut } from "@/app/login/actions";
import { NavRail } from "@/components/NavRail";
import { ReasonLogo, OperatedBy } from "@/components/Brand";
import { APP_VERSION } from "@/lib/version";
import { MEETING_LABEL, fmtMeeting } from "@/lib/meetings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { company, profile, supabase } = await requireCustomer();
  const [{ count: openHomework }, { data: nextMeeting }, { data: progress }] = await Promise.all([
    supabase.from("homeworks").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "open"),
    supabase
      .from("company_meetings")
      .select("kind, scheduled_at, meeting_url")
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
      <aside className="print:hidden w-[260px] shrink-0 border-r hairline px-6 py-8 flex flex-col">
        <Link href="/" className="block"><ReasonLogo width={212} /></Link>
        <p className="serif text-[16px] leading-snug mt-6">{company.name}</p>
        <p className="text-[13px] text-ink-3 mt-1">{STATUS_LABEL[company.status] ?? company.status}</p>
        {company.status === "diagnosed" ? (
          <nav className="mt-6"><Link href="/diagnosis" className="block text-[14px] py-[7px] pl-3 -ml-3 border-l-2 border-navy">適合診断の結果</Link></nav>
        ) : (
          <NavRail stages={stages} />
        )}
        <Link href="/ask" className="btn-primary mt-8 block text-center">ベレネッツに質問を残す</Link>
        <div className="mt-auto pt-8 text-[13px] text-ink-2 space-y-2">
          {nextMeeting && (
            <div className="rounded-[var(--radius)] bg-warm-soft px-4 py-3 -mx-1">
              <p className="text-[11px] font-semibold tracking-wide text-warm">次の面談 · {MEETING_LABEL[nextMeeting.kind] ?? nextMeeting.kind}</p>
              <p className="num text-[17px] font-semibold text-ink mt-1 leading-tight">{fmtMeeting(nextMeeting.scheduled_at)}</p>
              {nextMeeting.meeting_url ? (
                <a href={nextMeeting.meeting_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-[13px] font-medium text-warm underline underline-offset-4 hover:opacity-80">
                  会議に参加する ↗
                </a>
              ) : (
                <p className="text-[12px] text-ink-3 mt-2">会議URL未設定</p>
              )}
            </div>
          )}
          <p>
            <Link href="/homework" className="hover:text-ink">宿題 <span className="num">{openHomework ?? 0}</span></Link>
          </p>
          <p>
            <Link href="/report" className="hover:text-ink">エラーレポート</Link>
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
