import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/session";
import { STAGES, NOT_READY } from "@/lib/stages";
import { ProgramStart } from "@/components/ProgramStart";
import { loadKickoff } from "@/server/kickoff";
import { isStep0Ready, loadNowStep } from "@/server/gates";
import { loadPendingCandidates } from "@/server/meetingNext";
import { KickoffPicker } from "@/components/KickoffPicker";
import { chooseMeeting, requestOtherDates } from "@/app/(app)/meetings/actions";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("ja-JP", { hour: "numeric", hour12: false, timeZone: "Asia/Tokyo" }).format(new Date()));
  if (h >= 5 && h < 10) return "おはようございます";
  if (h >= 10 && h < 17) return "こんにちは";
  return "こんばんは";
}

export default async function Home() {
  const { company, supabase } = await requireCustomer();
  if (company.status === "diagnosed") {
    // 申込前：診断結果が最初の画面。申込後：ここで「契約→入金→キックオフ日」の進み具合を見せ、診断結果は振り返り用のリンクに
    if (!company.applied_at && !company.contracted_at && !company.paid_at) redirect("/diagnosis");
    const [{ data: d }, kickoff, { data: heldKickoff }] = await Promise.all([
      supabase.from("diagnosis_results").select("expires_at").eq("company_id", company.id).maybeSingle(),
      loadKickoff(company.id),
      supabase.from("company_meetings").select("held_at").eq("company_id", company.id).eq("kind", "kickoff").not("held_at", "is", null).order("held_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const paid = !!company.paid_at;
    const contracted = paid || !!company.contracted_at;
    const kickoffDone = paid && !!heldKickoff?.held_at;
    const now = kickoffDone ? "キックオフが終わりました。ベレネッツが STEP 1 を開くまで、少しお待ちください。" : !contracted ? "ベレネッツから申込書・契約書と請求書がメールで届きます（2営業日以内）。" : !paid ? "入金が確認されると、この画面でキックオフの日を選べるようになります。" : !kickoff.chosen ? "キックオフの日を選んでください。" : "キックオフの日が決まりました。当日まで、会社案内や資料を手元にそろえておいてください。";
    return (
      <div>
        <h1 className="serif text-[30px] leading-tight">{company.name}様、{greeting()}。</h1>
        <p className="text-ink-2 mt-3 max-w-[40em] leading-relaxed">お申し込みありがとうございます。8週間は、キックオフから始まります。</p>
        <Link href="/diagnosis" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border-2 border-navy bg-navy-soft px-5 py-4 hover:brightness-[0.98]">
          <span>
            <span className="block text-[11px] font-semibold tracking-wide text-navy">初回ヒアリングの診断結果</span>
            <span className="serif block text-[18px] leading-snug mt-0.5">適合診断の結果を振り返る</span>
            <span className="block text-[12px] text-ink-2 mt-0.5">見つかった芽・ブレーキ・8週間で残るもの。いつでも読み返せます</span>
          </span>
          <span className="text-navy text-[20px]" aria-hidden>→</span>
        </Link>
        <section className="mt-10">
          <p className="text-[13px] text-ink-3">いま</p>
          <h2 className="serif text-[22px] mt-1">{now}</h2>
        </section>
        <ProgramStart company={company} chosenDate={kickoff.chosen} dates={kickoff.candidates} expiresAt={d?.expires_at ?? null} heading={false} actionFirst kickoffDone={kickoffDone} />
      </div>
    );
  }
  const [{ data: progress }, { data: hw }, pick] = await Promise.all([
    supabase.from("v_divergence_progress").select("pair_count").eq("company_id", company.id).maybeSingle(),
    supabase.from("homeworks").select("id, title, why, due_at, priority").eq("company_id", company.id).eq("status", "open").order("priority", { ascending: false }).order("due_at").limit(3),
    ["grace", "locked", "cancelled"].includes(company.status) ? Promise.resolve(null) : loadPendingCandidates(supabase, company.id),
  ]);
  const openHomework = hw?.length ?? 0;
  const rows = progress?.pair_count ?? 0;
  // 編集期間が終わった会社は STEP 0 が空でも資料の登録を促さない（左メニューと同じ）
  const step0Ready = ["locked", "cancelled"].includes(company.status) ? true : await isStep0Ready(supabase, company.id);
  const step = step0Ready
    ? await loadNowStep(supabase, company.id, company.status, rows)
    : { key: "step0", title: "会社資料を上げる", body: "まず、会社案内やWebサイトを登録するか、御社の説明を入れてください。AIはここを土台に下書きを作るので、空のままでは次の段階（提供価値の書き出し）が開きません。" };
  const stage = STAGES.find((s) => s.key === step.key);
  const closed = company.status === "locked" || company.status === "cancelled";

  return (
    <div>
      <h1 className="serif text-[30px] leading-tight">{company.name}様、{greeting()}。</h1>

      {pick && (
        <section id="meeting-pick" className="mt-8 rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-6 py-5 max-w-[44em]">
          <p className="text-[11px] font-semibold tracking-wide text-warm">ベレネッツとの面談 · {pick.label}</p>
          <p className="text-[15px] mt-1">候補日が <span className="num font-semibold">{pick.candidates.length}</span> 件届いています。ご都合のよい日時を1つ選んでください。</p>
          <KickoffPicker dates={pick.candidates} action={chooseMeeting} label={pick.label} kind={pick.kind} declineAction={requestOtherDates} />
        </section>
      )}

      <section className="mt-12">
        <p className="text-[13px] text-ink-3">いま進めること</p>
        <h2 className="serif text-[22px] mt-1">{step.title}</h2>
        <p className="text-ink-2 mt-2 max-w-[40em] leading-relaxed">{step.body}</p>
        {stage && !NOT_READY.has(stage.key) && (
          <Link href={stage.href} className="btn-primary inline-block mt-6">
            {step.title} →
          </Link>
        )}
        {stage && NOT_READY.has(stage.key) && (
          <p className="mt-6 rounded-[var(--radius)] bg-paper-2 px-5 py-4 text-sm text-ink-2 max-w-[40em]">この段階の画面は、いま準備中です。できあがりしだい、この画面でご案内します。それまでは前の段階の見直しや、宿題を進めてください。</p>
        )}
        {company.reaccess && company.reaccess_until && (
          <p className="mt-4 rounded-[var(--radius)] bg-navy-soft px-5 py-3 text-sm text-ink-2 max-w-[40em]">
            ご連絡をいただき、ベレネッツが <span className="num font-semibold text-ink">{new Date(company.reaccess_until).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" })}</span> まで提供価値シートをダウンロードできるようにしています。
          </p>
        )}
        {company.status === "locked" && <a href="/api/export?step=deploy" className="btn-primary inline-block mt-6">提供価値シートをダウンロード</a>}
        {!["locked", "cancelled"].includes(company.status) && <p className="text-[13px] text-ink-3 mt-6 max-w-[40em] leading-relaxed">
          ステップは STEP 0 から順に進みます。各画面のいちばん下に「次のステップ」があり、条件を満たすとボタンが押せます。画面が準備中の段階は、できあがりしだいご案内します。ベレネッツとの面談のあとに開くステップもあります。
        </p>}
      </section>

      {openHomework > 0 && !closed && (
        <section className="mt-12 rounded-[var(--radius)] bg-navy-soft px-6 py-5 max-w-[40em]">
          <p className="text-[11px] font-semibold tracking-wide text-navy">宿題 · 次の面談までに</p>
          <p className="text-sm text-ink-2 mt-1">シートの「仮説」を事実に変えるために、御社に調べてもらうことです。一人で決めず、周りの人に聞いてから書いてください。</p>
          <ul className="mt-3 space-y-2">
            {hw!.map((h) => (
              <li key={h.id} className="text-sm">
                <span className="text-hypo text-xs mr-2">{"★".repeat(h.priority)}</span>
                <span>{h.title}</span>
                {h.due_at && <span className="num text-[12px] text-ink-3 ml-2">期限 {new Date(h.due_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })}</span>}
                {h.why && <span className="block text-[12px] text-ink-3 ml-7">効く場所：{h.why}</span>}
              </li>
            ))}
          </ul>
          <Link href="/homework" className="btn-primary inline-block mt-4">宿題を見る</Link>
        </section>
      )}
    </div>
  );
}
