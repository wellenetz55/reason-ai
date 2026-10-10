export const instant = false;
import Link from "next/link";
import { requireCustomer } from "@/lib/session";
import { STAGES, STATUS_LABEL, isStageOpen, currentStep } from "@/lib/stages";
import { SignOutButton } from "@/components/SignOutButton";
import { NavRail } from "@/components/NavRail";
import { ReasonLogo, OperatedBy } from "@/components/Brand";
import { APP_VERSION } from "@/lib/version";
import { PendingBar } from "@/components/PendingBar";
import { Bug } from "lucide-react";
import { MEETING_LABEL, fmtMeeting } from "@/lib/meetings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { company, profile, supabase } = await requireCustomer();
  const [{ data: openHw }, { data: nextMeeting }, { data: progress }, { data: diag }] = await Promise.all([
    supabase.from("homeworks").select("id, title, due_at").eq("company_id", company.id).eq("status", "open").order("due_at"),
    supabase
      .from("company_meetings")
      .select("kind, scheduled_at, meeting_url")
      .eq("company_id", company.id)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(1)
      .maybeSingle(),
    supabase.from("v_divergence_progress").select("pair_count").eq("company_id", company.id).maybeSingle(),
    supabase.from("diagnosis_results").select("company_id").eq("company_id", company.id).maybeSingle(),
  ]);

  const openHomework = openHw?.length ?? 0;
  // 契約前（適合診断済み）はキックオフ以外の面談を見せない。枠は残して「——」
  const shownMeeting = company.status === "diagnosed" ? (nextMeeting?.kind === "kickoff" ? nextMeeting : null) : nextMeeting;
  const overdue = (openHw ?? []).filter((h) => h.due_at && new Date(h.due_at) < new Date()).length;
  const nearest = (openHw ?? []).find((h) => h.due_at);
  const nowKey = currentStep(company.status, progress?.pair_count ?? 0).key;
  const stages = STAGES.map((s) => ({ ...s, open: isStageOpen(s, company.status), now: s.key === nowKey }));

  return (
    <div className="flex-1 flex min-h-screen">
      <PendingBar stamp={Date.now()} />
      <aside className="print:hidden w-[260px] shrink-0 border-r hairline px-6 py-8 flex flex-col">
        <Link href="/" className="block"><ReasonLogo width={212} /></Link>
        <p className="serif text-[16px] leading-snug mt-6">{company.name}</p>
        <p className="text-[13px] text-ink-2 mt-1">{profile.display_name} <span className="text-ink-3">さん</span></p>
        <div className="mt-3 rounded-[var(--radius)] border border-navy/30 bg-navy-soft px-3.5 py-2.5">
          <p className="text-[11px] font-semibold text-navy tracking-wide">現在のフェーズ</p>
          <p className="text-[13px] text-ink mt-0.5">{STATUS_LABEL[company.status] ?? company.status}</p>
        </div>
        {/* 宿題：フェーズのすぐ下。未回答があれば暖色で目立たせる（契約前は出さない） */}
        {company.status !== "diagnosed" && (openHomework > 0 ? (
          <Link href="/homework" className={`mt-3 block rounded-[var(--radius)] border-2 px-3.5 py-3 hover:brightness-[0.98] ${overdue > 0 ? "border-warm bg-warm text-white" : "border-warm bg-warm-soft"}`}>
            <p className={`flex items-center gap-2 text-[12px] font-bold tracking-wide ${overdue > 0 ? "text-white" : "text-warm"}`}>
              {overdue === 0 && <span className="now-dot" aria-hidden />}
              {overdue > 0 ? `宿題の期限が過ぎています（${overdue}件）` : "宿題があります"}
            </p>
            <p className={`mt-1 ${overdue > 0 ? "text-white" : "text-ink"}`}><span className="num text-[24px] font-bold leading-none">{openHomework}</span><span className="text-[12px] ml-1">件 未回答 · 次の面談までに</span></p>
            {nearest?.due_at && <p className={`text-[12px] mt-1 truncate ${overdue > 0 ? "text-white/85" : "text-ink-2"}`}>期限 <span className="num">{new Date(nearest.due_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })}</span>：{nearest.title}</p>}
            <p className={`mt-2 text-[13px] font-semibold ${overdue > 0 ? "text-white" : "text-warm"}`}>回答する →</p>
          </Link>
        ) : (
          <Link href="/homework" className="mt-3 block rounded-[var(--radius)] border hairline px-3.5 py-2 text-[12px] text-ink-3 hover:text-ink">宿題 · すべて回答済み ✓</Link>
        ))}
        {company.status === "diagnosed" ? (
          <nav className="mt-6">
            <Link href="/diagnosis" className="block text-[14px] py-[7px] pl-3 -ml-3 border-l-2 border-navy">適合診断の結果</Link>
            <p className="mt-5 text-[11px] font-semibold tracking-wide text-ink-3">契約後にスタートできる8週間のステップ</p>
            <ol className="mt-1 opacity-60">
              {STAGES.map((s) => (
                <li key={s.key} className="flex items-center gap-2.5 py-[6px] pl-3 -ml-3 text-ink-3" title="契約後にスタートできます">
                  <span className="num inline-block shrink-0 w-[60px] text-center rounded-full py-[3px] text-[9px] font-semibold tracking-[0.1em] leading-none border border-dashed border-ink-3">{s.step}</span>
                  <span className="text-[13px] leading-tight">{s.label}</span>
                </li>
              ))}
            </ol>
          </nav>
        ) : (
          <>
            <NavRail stages={stages} />
            {diag && (
              <Link href="/diagnosis" className="mt-4 block text-[12px] text-ink-2 hover:text-ink border-t hairline pt-3">
                適合診断の結果<span className="text-ink-3">（初回ヒアリング）</span> →
              </Link>
            )}
          </>
        )}
        <Link href="/ask" className="btn-primary mt-8 block text-center">ベレネッツに質問を残す</Link>
        <div className="mt-auto pt-8 text-[13px] text-ink-2 space-y-2">
          {shownMeeting ? (
            <div className="rounded-[var(--radius)] bg-warm-soft px-4 py-3 -mx-1">
              <p className="text-[11px] font-semibold tracking-wide text-warm">次の面談 · {MEETING_LABEL[shownMeeting.kind] ?? shownMeeting.kind}</p>
              <p className="num text-[17px] font-semibold text-ink mt-1 leading-tight">{fmtMeeting(shownMeeting.scheduled_at)}</p>
              {shownMeeting.meeting_url ? (
                <a href={shownMeeting.meeting_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-[13px] font-medium text-warm underline underline-offset-4 hover:opacity-80">
                  会議に参加する ↗
                </a>
              ) : (
                <p className="text-[12px] text-ink-3 mt-2">会議URL未設定</p>
              )}
            </div>
          ) : (
            <div className="rounded-[var(--radius)] bg-warm-soft px-4 py-3 -mx-1">
              <p className="text-[11px] font-semibold tracking-wide text-warm">次の面談</p>
              <p className="num text-[17px] font-semibold text-ink-3 mt-1 leading-tight">——</p>
            </div>
          )}
          <div className="pt-2"><SignOutButton /></div>
          <OperatedBy className="pt-4" />
          <div className="pt-3 flex items-center justify-between gap-3">
            <Link href="/report" className="inline-flex items-center gap-1.5 rounded-full border hairline px-3 py-1 text-[11px] text-ink-2 hover:text-ink hover:bg-paper-2">
              <Bug size={12} strokeWidth={1.75} aria-hidden className="text-ink-3" />エラーレポート
            </Link>
            <p className="num text-[11px] text-ink-3">{APP_VERSION}</p>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-10 py-10">
        {/* 印刷時だけ出るヘッダ（ロゴ・運営・会社名・日付）。画面では非表示 */}
        <div className="hidden print:flex items-center justify-between pb-4 mb-8 border-b hairline">
          <ReasonLogo width={180} />
          <div className="text-right text-[11px] text-ink-3">
            <p>{company.name} 様</p>
            <p className="num">{new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" })}</p>
            <p>運営 株式会社ベレネッツ · www.wellenetz.co.jp</p>
          </div>
        </div>
        <div className="max-w-[960px]">{children}</div>
        <footer className="print:hidden max-w-[960px] mt-20 pt-5 border-t hairline flex items-end justify-between gap-6 text-[12px] text-ink-3">
          <div className="space-y-1">
            <p className="text-ink-2">選ばれる理由AI <span className="mx-1.5">·</span> 運営 株式会社ベレネッツ</p>
            <a href="https://www.wellenetz.co.jp/" target="_blank" rel="noopener noreferrer" className="hover:text-ink">www.wellenetz.co.jp</a>
          </div>
          <div className="text-right space-y-1">
            <p>
              <Link href="/ask" className="hover:text-ink">ベレネッツに質問を残す</Link>
              <span className="mx-2">／</span>
              <Link href="/report" className="hover:text-ink">エラーレポート</Link>
            </p>
            <p className="num text-[11px]">{APP_VERSION}</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
