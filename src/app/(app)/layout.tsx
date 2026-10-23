export const instant = false;
import Link from "next/link";
import { requireCustomer } from "@/lib/session";
import { STAGES, STATUS_LABEL, isStageOpen, NOT_READY } from "@/lib/stages";
import { SignOutButton } from "@/components/SignOutButton";
import { NavRail } from "@/components/NavRail";
import { ProgramOutline } from "@/components/ProgramOutline";
import { isStep0Ready, loadNowStep } from "@/server/gates";
import { ReasonLogo, OperatedBy } from "@/components/Brand";
import { APP_VERSION } from "@/lib/version";
import { PendingBar } from "@/components/PendingBar";
import { Bug } from "lucide-react";
import { MEETING_LABEL, fmtMeeting, safeMeetingUrl } from "@/lib/meetings";
import { SideNav } from "@/components/SideNav";
import { RouteTracker } from "@/components/RouteTracker";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { company, profile, supabase } = await requireCustomer();
  // 契約前（適合診断済み）はキックオフ以外の面談を見せない。枠は残して「——」
  let meetingQ = supabase.from("company_meetings").select("kind, scheduled_at, meeting_url").eq("company_id", company.id).is("held_at", null).gte("scheduled_at", new Date(Date.now() - 3 * 3600_000).toISOString());
  if (company.status === "diagnosed") meetingQ = meetingQ.eq("kind", "kickoff");
  const [{ data: openHw }, { data: upcomingMeetings }, { data: progress }, { data: diag }, { count: hwTotal }, { data: heldKickoff }, { data: allMeetings }] = await Promise.all([
    supabase.from("homeworks").select("id, title, due_at").eq("company_id", company.id).eq("status", "open").order("due_at"),
    meetingQ.order("scheduled_at").limit(8),
    supabase.from("v_divergence_progress").select("pair_count").eq("company_id", company.id).maybeSingle(),
    supabase.from("diagnosis_results").select("company_id").eq("company_id", company.id).maybeSingle(),
    supabase.from("homeworks").select("id", { count: "exact", head: true }).eq("company_id", company.id),
    supabase.from("company_meetings").select("id").eq("company_id", company.id).eq("kind", "kickoff").not("held_at", "is", null).limit(1).maybeSingle(),
    supabase.from("company_meetings").select("kind, scheduled_at, held_at").eq("company_id", company.id).neq("kind", "internal").order("scheduled_at"),
  ]);
  // 左メニューの面談の印：種類ごとに「済」があれば済、無ければ一番近い予定
  const meetingMarks: Record<string, { at: string | null; held: boolean; candidates?: number }> = {};
  const recentCut = Date.now() - 3 * 3600_000;
  for (const m of allMeetings ?? []) {
    // 契約前は、キックオフ以外の面談を見せない（上の「次の面談」と同じ）
    if (company.status === "diagnosed" && m.kind !== "kickoff") continue;
    const cur = meetingMarks[m.kind];
    if (m.held_at) { meetingMarks[m.kind] = { at: m.held_at, held: true }; continue; }
    if (cur?.held) continue;
    const t = new Date(m.scheduled_at).getTime();
    const curT = cur?.at ? new Date(cur.at).getTime() : null;
    // これからの予定のうち一番近いもの。これからの予定が無ければ、過ぎた予定を出す（並びは古い順）
    if (!cur || (curT !== null && curT < recentCut && t >= recentCut)) meetingMarks[m.kind] = { at: m.scheduled_at, held: false };
  }
  for (const k in meetingMarks) {
    const n = (allMeetings ?? []).filter((m) => m.kind === k && !m.held_at && new Date(m.scheduled_at) > new Date()).length; // 候補はこれからの日時だけ
    if (!meetingMarks[k].held && n > 1) meetingMarks[k].candidates = n;
  }
  const kickoffDone = company.status === "diagnosed" && !!company.paid_at && !!heldKickoff;
  // STEP 0 が空のうちは、STEP 1 以降を左メニューで開かない（押すと STEP 0 への案内が出る）
  const step0Ready = ["diagnosed", "locked", "cancelled"].includes(company.status) ? true : await isStep0Ready(supabase, company.id);

  const openHomework = openHw?.length ?? 0;
  // 次の面談：一番近い予定。同じ種類の未実施が2件以上あるときは「候補日」なので、確定として見せず、選ぶ画面へ案内する
  const nextMeeting = (upcomingMeetings ?? [])[0] ?? null;
  // 候補日を選べる場所：確認セッション①は STEP 2 の出口、それ以外はホーム上部（#meeting-pick）。キックオフはホーム（契約前）
  const PICK_HREF: Record<string, string> = { kickoff: "/", session1: "/sheet/merge", midcheck: "/#meeting-pick", session2: "/#meeting-pick", session3: "/#meeting-pick" };
  // 候補日として扱うのはベレネッツとの面談だけ（社内打合せ・顧問月次は、何件あっても候補ではない）
  const pickable = !!nextMeeting && !!PICK_HREF[nextMeeting.kind] && (nextMeeting.kind !== "kickoff" || company.status === "diagnosed");
  const candidateCount = nextMeeting && pickable ? (upcomingMeetings ?? []).filter((m) => m.kind === nextMeeting.kind && new Date(m.scheduled_at) > new Date()).length : 0;
  const shownMeeting = candidateCount > 1 ? null : nextMeeting;
  const candidateMeeting = candidateCount > 1 && nextMeeting ? { kind: nextMeeting.kind, count: candidateCount, href: PICK_HREF[nextMeeting.kind] ?? "/" } : null;
  const overdue = (openHw ?? []).filter((h) => h.due_at && new Date(h.due_at) < new Date()).length;
  const nearest = (openHw ?? []).find((h) => h.due_at);
  const nowKey = step0Ready ? (await loadNowStep(supabase, company.id, company.status, progress?.pair_count ?? 0)).key : "step0";
  const pairs = progress?.pair_count ?? 0;
  // まとめて絞る（STEP 2）は、1〜2週目のうちは20組そろってから開く。いったんレビューを始めた会社は、却下で20組を割っても閉じない（画面・サーバ側と同じ）
  let mergeLocked = company.status === "week1_2" && pairs < 20;
  if (mergeLocked) {
    const { count: started } = await supabase.from("row_diagnoses").select("row_id, sheet_rows!inner(company_id)", { count: "exact", head: true }).eq("sheet_rows.company_id", company.id);
    if (started) mergeLocked = false;
  }
  const stages = STAGES.map((s) => ({
    ...s,
    open: isStageOpen(s, company.status) && !(s.key === "merge" && mergeLocked) && (s.key === "step0" || step0Ready),
    lockNote: s.key === "merge" && mergeLocked ? `STEP 1 で組があと${20 - pairs}組そろうと開きます` : s.key !== "step0" && !step0Ready && isStageOpen(s, company.status) ? "STEP 0 で会社の資料か説明を入れると開きます" : undefined,
    ready: !NOT_READY.has(s.key),
    now: s.key === nowKey,
  }));

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen">
      <PendingBar stamp={Date.now()} />
      <RouteTracker />
      <SideNav brand={<Link href="/" className="block"><ReasonLogo width={180} /></Link>}>
        <Link href="/" className="hidden md:block"><ReasonLogo width={212} /></Link>
        <p className="serif text-[16px] leading-snug md:mt-6">{company.name}</p>
        <p className="text-[13px] text-ink-2 mt-1">{profile.display_name} <span className="text-ink-3">さん</span></p>
        <div className="mt-3 rounded-[var(--radius)] border border-navy/30 bg-navy-soft px-3.5 py-2.5">
          <p className="text-[11px] font-semibold text-navy tracking-wide">現在のフェーズ</p>
          <p className="text-[13px] text-ink mt-0.5">{company.status === "diagnosed" ? (kickoffDone ? "キックオフ終了（STEP 1 の準備中）" : company.paid_at ? "キックオフ前（日程調整）" : company.applied_at || company.contracted_at ? "お申し込み済み（契約手続き中）" : "適合診断の結果をご確認ください") : STATUS_LABEL[company.status] ?? company.status}</p>
        </div>
        {/* 宿題：フェーズのすぐ下。未回答があれば暖色で目立たせる（契約前は出さない） */}
        {!["diagnosed", "locked", "cancelled"].includes(company.status) && (openHomework > 0 ? (
          <Link href="/homework" className={`mt-3 block rounded-[var(--radius)] border-2 px-3.5 py-3 hover:brightness-[0.98] ${overdue > 0 ? "border-warm bg-warm text-on-accent" : "border-warm bg-warm-soft"}`}>
            <p className={`flex items-center gap-2 text-[12px] font-bold tracking-wide ${overdue > 0 ? "text-on-accent" : "text-warm"}`}>
              {overdue === 0 && <span className="now-dot" aria-hidden />}
              {overdue > 0 ? `宿題の期限が過ぎています（${overdue}件）` : "宿題があります"}
            </p>
            <p className={`mt-1 ${overdue > 0 ? "text-on-accent" : "text-ink"}`}><span className="num text-[24px] font-bold leading-none">{openHomework}</span><span className="text-[12px] ml-1">件 未回答 · 次の面談までに</span></p>
            {nearest?.due_at && <p className={`text-[12px] mt-1 truncate ${overdue > 0 ? "text-on-accent/85" : "text-ink-2"}`}>期限 <span className="num">{new Date(nearest.due_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })}</span>：{nearest.title}</p>}
            <p className={`mt-2 text-[13px] font-semibold ${overdue > 0 ? "text-on-accent" : "text-warm"}`}>回答する →</p>
          </Link>
        ) : (
          <Link href="/homework" className="mt-3 block rounded-[var(--radius)] border hairline px-3.5 py-2 text-[12px] text-ink-3 hover:text-ink">{(hwTotal ?? 0) > 0 ? "宿題 · すべて回答済み ✓" : "宿題 · まだ出ていません"}</Link>
        ))}
        {company.status === "diagnosed" ? (
          <nav className="mt-6">
            {company.applied_at || company.contracted_at || company.paid_at ? (
              <>
                <Link href="/" className="block text-[14px] py-[7px] pl-3 -ml-3 border-l-2 border-navy">キックオフまでの進み具合</Link>
                <Link href="/diagnosis" className="block text-[13px] py-[6px] pl-3 -ml-3 text-ink-2 hover:text-ink">適合診断の結果<span className="text-ink-3">（振り返り）</span></Link>
              </>
            ) : (
              <Link href="/diagnosis" className="block text-[14px] py-[7px] pl-3 -ml-3 border-l-2 border-navy">適合診断の結果</Link>
            )}
            <ProgramOutline kickoffDone={kickoffDone} />
          </nav>
        ) : (
          <>
            {!["locked", "cancelled"].includes(company.status) && <NavRail stages={stages} meetings={meetingMarks} />}
            {diag && (
              <Link href="/diagnosis" className="mt-4 block text-[12px] text-ink-2 hover:text-ink border-t hairline pt-3">
                適合診断の結果<span className="text-ink-3">（初回ヒアリング）</span> →
              </Link>
            )}
          </>
        )}
        <Link href="/ask" className="btn-primary mt-8 block text-center">ベレネッツに質問を残す</Link>
        <p className="mt-1.5 text-[11px] text-ink-3 text-center">ベレネッツからの回答は、質問と同じ画面に表示されます。</p>
        <div className="mt-auto pt-8 text-[13px] text-ink-2 space-y-2">
          {["locked", "cancelled"].includes(company.status) ? null : candidateMeeting ? (
            <Link href={candidateMeeting.href} className="block rounded-[var(--radius)] bg-warm-soft border-2 border-warm px-4 py-3 -mx-1 hover:brightness-[0.98]">
              <p className="text-[11px] font-semibold tracking-wide text-warm">次の面談 · {MEETING_LABEL[candidateMeeting.kind] ?? candidateMeeting.kind}</p>
              <p className="text-[15px] font-semibold text-ink mt-1 leading-tight">候補日が <span className="num">{candidateMeeting.count}</span> 件届いています</p>
              <p className="text-[12px] text-warm mt-1.5 font-medium">ご都合のよい日を1つ選んでください →</p>
            </Link>
          ) : shownMeeting ? (
            <div className="rounded-[var(--radius)] bg-warm-soft px-4 py-3 -mx-1">
              <p className="text-[11px] font-semibold tracking-wide text-warm">次の面談 · {MEETING_LABEL[shownMeeting.kind] ?? shownMeeting.kind}</p>
              <p className="num text-[17px] font-semibold text-ink mt-1 leading-tight">{fmtMeeting(shownMeeting.scheduled_at)}</p>
              {safeMeetingUrl(shownMeeting.meeting_url) ? (
                <a href={safeMeetingUrl(shownMeeting.meeting_url)!} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-[13px] font-medium text-warm underline underline-offset-4 hover:opacity-80">
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
          <div className="pt-1 flex items-center gap-2 text-[11px] text-ink-3">表示<ThemeToggle /></div>
          <OperatedBy className="pt-4" />
          <div className="pt-3 flex items-center justify-between gap-3">
            <Link href="/report" className="inline-flex items-center gap-1.5 rounded-full border hairline px-3 py-1 text-[11px] text-ink-2 hover:text-ink hover:bg-paper-2">
              <Bug size={12} strokeWidth={1.75} aria-hidden className="text-ink-3" />エラーレポート
            </Link>
            <p className="num text-[11px] text-ink-3">{APP_VERSION}</p>
          </div>
        </div>
      </SideNav>
      <main className="flex-1 min-w-0 px-4 py-6 md:px-10 md:py-10">
        {/* 印刷時だけ出るヘッダ（ロゴ・運営・会社名・日付）。画面では非表示 */}
        <div className="hidden print:flex items-center justify-between pb-4 mb-8 border-b hairline">
          <ReasonLogo width={180} />
          <div className="text-right text-[11px] text-ink-3">
            <p>{company.name} 様</p>
            <p className="num">{new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" })}</p>
            <p>運営 株式会社ベレネッツ · www.wellenetz.co.jp</p>
          </div>
        </div>
        <div className="max-w-[1120px]">{children}</div>
        <footer className="print:hidden max-w-[1120px] mt-20 pt-5 border-t hairline flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-6 text-[12px] text-ink-3">
          <div className="space-y-1">
            <p className="text-ink-2">選ばれる理由AI <span className="mx-1.5">·</span> 運営 株式会社ベレネッツ</p>
            <a href="https://www.wellenetz.co.jp/" target="_blank" rel="noopener noreferrer" className="hover:text-ink">www.wellenetz.co.jp</a>
          </div>
          <div className="sm:text-right space-y-1">
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
