import { fmtMeeting } from "@/lib/meetings";
import { chooseKickoff, applyProgram } from "@/app/(app)/diagnosis/actions";
import { KickoffPicker } from "@/components/KickoffPicker";
import { requestOtherDates } from "@/app/(app)/meetings/actions";

export type StartCompany = { name: string; applied_at: string | null; contracted_at: string | null; paid_at: string | null };

/**
 * 「ここから、8週間が始まるまで」：申込 → 契約 → 入金 → キックオフ日 の進み具合と、いまやること。
 * 申込前は診断結果ページの下に、申込後はホームに出す。
 */
export function ProgramStart({ company, chosenDate, dates, expiresAt, preview = false, heading = true, actionFirst = false, kickoffDone = false }: { company: StartCompany; chosenDate: string | null; dates: string[]; expiresAt: string | null; preview?: boolean; heading?: boolean; actionFirst?: boolean; kickoffDone?: boolean }) {
  // 運営が段階を飛ばして記録しても矛盾しないよう、後の段階が済んでいれば前の段階も済みとみなす
  const paid = !!company.paid_at;
  const contracted = paid || !!company.contracted_at;
  const applied = contracted || !!company.applied_at;
  const steps = [
    { key: "apply", label: "申し込む", at: company.applied_at, done: applied, now: !applied },
    { key: "contract", label: "契約書を取り交わす", at: company.contracted_at, done: contracted, now: applied && !contracted },
    { key: "pay", label: "入金", at: company.paid_at, done: paid, now: contracted && !paid },
    { key: "kickoff", label: kickoffDone ? "キックオフ 実施済" : "キックオフ日を選ぶ", at: chosenDate, done: paid && (!!chosenDate || kickoffDone), now: paid && !chosenDate && !kickoffDone },
  ];
  const action = (
        <div className="mt-6">
          {!applied && expiresAt && new Date(expiresAt) < new Date() ? (
            <p className="text-sm">このページの閲覧期限（<span className="num">{fmtMeeting(expiresAt)}</span>）が過ぎたため、ここからのお申し込みは締め切りました。お申し込みを希望される場合は「ベレネッツに質問を残す」からご連絡ください。</p>
          ) : !applied ? (
            <>
              <div className="rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-6 sm:px-8 py-7 text-center">
                <p data-member-only className="text-sm text-ink-2 max-w-[36em] mx-auto">お申し込みは、御社の担当者（主担当）が行います。診断結果を読んで「進めたい」と思われたら、主担当の方にお伝えください。</p>
                <p data-admin-only className="text-sm text-ink-2 max-w-[36em] mx-auto">診断結果を読んで「進めたい」と思われたら、下のボタンを押してください。受付メールが届き、2営業日以内にベレネッツから申込書・契約書と請求書をメールでお送りします。</p>
                <form data-admin-only action={preview ? undefined : applyProgram} className="mt-5">
                  <button type="submit" disabled={preview} className="w-full sm:w-auto sm:min-w-[380px] rounded-[var(--radius)] bg-warm text-on-accent serif text-[20px] sm:text-[22px] font-semibold px-10 py-5 shadow-[0_6px_20px_rgba(0,0,0,0.15)] hover:brightness-110 active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-navy">このプログラムに申し込む →</button>
                </form>
                <p className="text-[12px] text-ink-2 mt-4">ボタンを押した時点では費用は発生しません。契約書の内容を確認してからのご契約です。</p>
              </div>
            </>
          ) : !paid ? (
            <p className="text-sm">
              {contracted
                ? "ご契約ありがとうございます。入金を確認しだい、キックオフの日程をこの画面でお選びいただけます。"
                : "お申し込みを受け付けました（受付メールをお送りしています）。2営業日以内に、ベレネッツから申込書・契約書と請求書をメールでお送りします。届かない場合は「ベレネッツに質問を残す」からお知らせください。"}
            </p>
          ) : kickoffDone ? (
            <p className="text-sm">キックオフは終わりました。ベレネッツが次の段階を開くと、左メニューに STEP 0・STEP 1 が出ます。開いたら、まず STEP 0 で会社の説明を確かめるところから始まります。</p>
          ) : chosenDate ? (
            <p className="text-sm">キックオフは <span className="num font-semibold">{fmtMeeting(chosenDate)}</span> で承りました。会議URLは決まりしだい、画面左の「次の面談」に表示します。</p>
          ) : dates.length > 0 ? (
            <>
              <p className="text-sm">入金を確認しました。キックオフ（3時間・オンライン）の日を選んでください。</p>
              <KickoffPicker dates={dates} action={chooseKickoff} preview={preview} kind="kickoff" declineAction={requestOtherDates} />
            </>
          ) : (
            <p className="text-sm">入金を確認しました。キックオフの候補日は、ベレネッツからご連絡します。</p>
          )}
        </div>
  );
  return (
      <section className={`${actionFirst ? "mt-4" : "mt-16 border-t hairline pt-8"} print:hidden`}>
        {heading && <h2 className="serif sec-title">ここから、8週間が始まるまで</h2>}
        {actionFirst && action}
        {!kickoffDone && <p className={`text-sm text-ink-2 max-w-[40em] ${actionFirst ? "mt-8" : "mt-1"}`}>契約と請求はメールでやりとりします。アプリでは、いまどこまで進んでいるかが見えます。</p>}
        <ol className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px] print-two-col">
          {steps.map((st, i) => (
            <li key={st.key} className={`rounded-[var(--radius)] border px-3 py-2.5 ${st.done ? "border-navy bg-navy text-on-accent" : st.now ? "border-warm bg-warm-soft" : "hairline text-ink-3"}`}>
              <p className={`num text-[10px] tracking-wide ${st.done ? "text-on-accent/70" : st.now ? "text-warm" : ""}`}>{i + 1}{st.done ? " ✓" : st.now ? " ← いまここ" : ""}</p>
              <p className="font-semibold mt-0.5">{st.label}</p>
              {st.at && <p className={`num text-[10px] mt-0.5 ${st.done ? "text-on-accent/70" : "text-ink-3"}`}>{fmtMeeting(st.at)}</p>}
            </li>
          ))}
        </ol>

        {!kickoffDone && (<>
        {/* キックオフの重み：全部AIではなく、最初の3時間は代表が直接行う。中身を具体的に見せて期待感をつくる */}
        <div className="mt-8 rounded-[var(--radius)] border-2 border-navy bg-navy-soft px-6 sm:px-8 py-6">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-navy">8週間は、ここから始まります</p>
          <h3 className="serif text-[22px] sm:text-[24px] leading-snug mt-2">キックオフ（3時間・オンライン）は、<br className="hidden sm:block" />ベレネッツ代表の平松が直接行います。</h3>
          <p className="text-sm text-ink-2 mt-3 max-w-[42em]">最初の問いはこれです。<span className="font-semibold text-ink">「15秒で、初めてのお客様に御社を“伝わるように”説明できますか」</span>。多くの会社が、ここで止まります。伝えているのに、伝わっていない。キックオフの3時間は、その理由を御社の言葉で解きほぐし、8週間で何をどう答えればよいかが分かった状態をつくる時間です。AIが出す毎日の問いは、この3時間を前提に設計されています。</p>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-4 print-one-col">
            <div className="rounded-[var(--radius)] bg-paper px-5 py-4">
              <p className="text-[11px] text-ink-3">なぜ、平松が話すのか</p>
              <p className="text-[13px] leading-relaxed mt-2">NTTドコモで広告宣伝を担当し、年間数百億円の広告を打っても「やればやるほどシェアが下がる」場面に立ち会いました。そこから25年、「押し付けずに引き寄せる」仕組みだけを作り続け、750社以上を支援。営業・コンペ・見積競争を一度もせずに選ばれてきた、その原理を本人が話します。</p>
            </div>
            <div className="rounded-[var(--radius)] bg-paper px-5 py-4">
              <p className="text-[11px] text-ink-3">3時間で扱う、7つのテーマ</p>
              <ol className="mt-2 space-y-1.5 text-[13px] leading-snug">
                <li className="flex gap-2"><span className="num text-ink-3 shrink-0 w-4">1</span><span><span className="font-semibold">差別化は「光の当て方」で見つかる</span>　御社が思う強みと、お客様が反応する強みは別物です</span></li>
                <li className="flex gap-2"><span className="num text-ink-3 shrink-0 w-4">2</span><span><span className="font-semibold">脳科学：原始脳と理性脳</span>　人はまず直感で「捉え」、あとから理屈で納得する。順番を逆にすると届きません</span></li>
                <li className="flex gap-2"><span className="num text-ink-3 shrink-0 w-4">3</span><span><span className="font-semibold">意識の階層</span>　「今すぐ客」は5%以下。残り95%にどう気づかせるか</span></li>
                <li className="flex gap-2"><span className="num text-ink-3 shrink-0 w-4">4</span><span><span className="font-semibold">人が動く6つの欲求</span>　お客様が「能動的に」動いてしまう起点</span></li>
                <li className="flex gap-2"><span className="num text-ink-3 shrink-0 w-4">5</span><span><span className="font-semibold">買う直前の「4つの不」</span>　不信・不要・不適・不急を、先回りして取り除く</span></li>
                <li className="flex gap-2"><span className="num text-ink-3 shrink-0 w-4">6</span><span><span className="font-semibold">「なぜなら」の接続詞</span>　有名になる必要はない。選ばれる理由に根拠をつける型</span></li>
                <li className="flex gap-2"><span className="num text-ink-3 shrink-0 w-4">7</span><span><span className="font-semibold">AI時代にも通用するのか</span>　AIにまだできない3つのこと（交渉・場を導く・人を動かす）と、この8週間の役割分担</span></li>
              </ol>
            </div>
          </div>

          <div className="mt-4 rounded-[var(--radius)] bg-paper px-5 py-4">
            <p className="text-[11px] text-ink-3">その場でやること</p>
            <p className="text-[13px] leading-relaxed mt-2">AIが読み込んだ御社の資料とWebから作った「御社はこういう会社です」の下書きを、その場で確かめます。そのうえで、御社のお客様が「どんな場面で、どんな気持ちのときに」御社を必要とするのかを言葉にし、最初の数組を一緒に作ります。翌日からは、毎日の問いに答えるだけで進みます。</p>
          </div>

          <p className="text-[13px] mt-4 max-w-[42em] pl-4 border-l-2 border-warm"><span className="font-semibold">キックオフのあとも、人が入ります。</span>2週目・5週目・8週目の面談と中間チェックは、すべてベレネッツが直接行います。AIに任せきりにはしません。</p>
        </div>

        </>)}
        {!actionFirst && action}
        {/* 費用と返金保証は、申し込むまで表示する（申込後は契約書でご案内） */}
        {!applied && <div className="mt-6 flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
          <span className="shrink-0 self-start inline-flex items-center gap-1.5 rounded-full border-2 border-warm bg-warm-soft text-warm text-[12px] font-bold px-3 py-1.5 whitespace-nowrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>
            半額返金保証
          </span>
          <p className="text-[13px] text-ink-2 leading-relaxed">
            費用は8週間で70万円（前払い・税別）。2週目の終わりの面談までに「違う」と感じられた場合は、半額を返金します。それ以降の返金はありません。
          </p>
        </div>}
      </section>
  );
}
