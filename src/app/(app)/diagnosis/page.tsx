import { requireCustomer } from "@/lib/session";
import { BRAKE_LABEL, TAG_LABEL } from "@/lib/diagnosis";
import { fmtMeeting } from "@/lib/meetings";
import { chooseKickoff, applyProgram, recordDiagnosisView } from "./actions";
import { PrintButton } from "@/components/PrintButton";

type Seed = { feature: string; experience: string; tag: string };
type Brake = { kind: string; words: string };
type Fit = { condition: string; quote: string };

// 3ステップ。1・2は「やること」、3は「手に入る状態」
const STEPS3 = [
  { n: "1", w: "第0〜2週", t: "集める", b: "キックオフ（3時間）でAIが御社の資料とWebを読み、「御社はこういう会社です」を下書きします。そこから毎日ちがう角度の問いに答えるだけで、提供価値・体験価値が組になって増えます。社内で当たり前すぎて誰も言わなかったことが、言葉になります。2週目の終わりに面談で確認します。", p: "ポイント：考えて書くのではなく、問いに答える。答えられない日は飛ばしてかまいません。" },
  { n: "2", w: "第3〜5週", t: "裏づける", b: "お客様が買う直前に迷う理由を書き出し、先回りの答えを用意します。お客様の声・数字・事実で「なぜなら」をつけ、言葉が浮つかなくなります。中間チェックと、5週目の終わりの面談で確認します。", p: "ポイント：きれいな言葉より、証拠のある言葉。言えない組は、残しません。" },
  { n: "3", w: "第6〜8週", t: "比べられても、選ばれる", b: "営業トーク・価格説明・Web・採用の文章に展開します。見積りの前の会話で「なぜ御社か」を自分の言葉で言える状態になります。最後の面談で、冒頭の一言をもう一度答えていただきます。", p: "ポイント：言葉は社長のものです。ベレネッツが代わりに書いた言葉は、ひとつも残りません。" },
];

// 「選ばれる理由」をつくろうとして、多くの会社がやること
const MISTAKES = [
  { t: "社内で会議して考える", b: "出てくるのは「品質・納期・対応力」。どの会社も言える言葉です。" },
  { t: "制作会社やライターに頼む", b: "きれいになります。ただ、他社でも言える言葉になります。" },
  { t: "ホームページを作り直す", b: "見た目は変わります。言葉が変わっていないので、結果は変わりません。" },
];

export default async function DiagnosisPage() {
  const { supabase, company } = await requireCustomer();
  const { data: d } = await supabase.from("diagnosis_results").select("*").eq("company_id", company.id).maybeSingle();
  if (!d) {
    return (
      <div>
        <h1 className="serif text-[28px] leading-tight">適合診断の結果</h1>
        <p className="text-sm text-ink-2 mt-3">まだ公開されていません。ベレネッツからの案内をお待ちください。</p>
      </div>
    );
  }
  await recordDiagnosisView();
  const seeds = (d.seeds ?? []) as Seed[];
  const brakes = (d.brakes ?? []) as Brake[];
  const fit = (d.fit_reasons ?? []) as Fit[];
  const comp = (d.competitor ?? null) as { name: string; claims: string[] } | null;
  const dates = (d.candidate_dates ?? []) as string[];
  const steps = [
    { key: "apply", label: "申し込む", at: company.applied_at, done: !!company.applied_at, now: !company.applied_at },
    { key: "contract", label: "契約書を取り交わす", at: company.contracted_at, done: !!company.contracted_at, now: !!company.applied_at && !company.contracted_at },
    { key: "pay", label: "入金", at: company.paid_at, done: !!company.paid_at, now: !!company.contracted_at && !company.paid_at },
    { key: "kickoff", label: "キックオフ日を選ぶ", at: d.chosen_date, done: !!d.chosen_date, now: !!company.paid_at && !d.chosen_date },
  ];
  const tagCls: Record<string, string> = { fact: "tag-fact", verify: "tag-verify", hypothesis: "tag-hypo" };

  return (
    <article className="max-w-[760px]">
      <p className="inline-block rounded-full bg-navy text-white text-[13px] font-semibold tracking-wide px-4 py-1.5">適合診断の結果</p>
      <h1 className="serif text-[30px] leading-tight mt-4"><span className="text-warm mr-1">◎</span>{company.name}様は、<span className="text-warm">「選ばれる理由」をつくれる会社</span>です。</h1>
      <div className="mt-3 flex items-center gap-4 text-[12px] text-ink-3">
        {d.published_at && <span className="num">{fmtMeeting(d.published_at)} 公開</span>}
        {d.expires_at && <span>このページは <span className="num">{fmtMeeting(d.expires_at)}</span> まで</span>}
        <PrintButton />
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3">
        <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
          <p className="text-[11px] text-ink-3">初回ヒアリングで見えた芽</p>
          <p className="serif text-[30px] leading-none mt-1"><span className="num">{seeds.length}</span><span className="text-[14px] ml-1">組</span></p>
        </div>
        <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
          <p className="text-[11px] text-ink-3">まだ言葉になっていないブレーキ</p>
          <p className="serif text-[30px] leading-none mt-1"><span className="num">{brakes.length}</span><span className="text-[14px] ml-1">つ</span></p>
        </div>
        <div className="rounded-[var(--radius)] bg-navy text-white px-5 py-4">
          <p className="text-[11px] text-white/70">8週間での目標</p>
          <p className="serif text-[30px] leading-none mt-1"><span className="num">30</span><span className="text-[14px] ml-1">組</span></p>
        </div>
      </div>

      {d.one_liner_before && (
        <section className="mt-12">
          <h2 className="serif text-[20px]">「御社を一言で言うと？」</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-ink-3">いま（面談でのお答え）</p>
              <blockquote className="serif text-[20px] leading-snug mt-2 border-l-2 border-navy pl-4">「{d.one_liner_before}」</blockquote>
            </div>
            <div>
              <p className="text-[11px] text-ink-3">8週間後</p>
              <div className="mt-2 rounded-[var(--radius)] border border-dashed border-ink-3 px-4 py-5 text-ink-3">
                <p className="serif text-[20px] leading-snug">「────────」</p>
                <p className="text-[12px] mt-2">8週間の最後の面談で、同じ問いにもう一度お答えいただきます。ここが埋まります。</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-ink-2 mt-4 max-w-[56ch]">多くの会社で、左は業種と所在地の説明、右はお客様が選ぶ理由になります。同じ会社の、同じ人の言葉で。</p>
        </section>
      )}

      {seeds.length > 0 && (
        <section className="mt-14">
          <h2 className="serif text-[20px]">初回ヒアリングで、もう見つかったもの</h2>
          <p className="text-sm text-ink-2 mt-1 max-w-[56ch]">御社の中では当たり前すぎて、誰も言っていなかったこと。お話しいただいた言葉を「御社は〜できる。だから、お客様は〜と感じられる」の型に仮に置いたものです。まだ仮説です。8週間で事実にします。</p>
          <ol className="mt-5 space-y-4">
            {seeds.map((s, i) => (
              <li key={i} className={`tag-line ${tagCls[s.tag] ?? "tag-hypo"} pl-5 py-1`}>
                <p className="serif text-[17px] leading-snug">御社は、{s.feature}</p>
                {s.experience && <p className="text-ink-2 mt-1">だから、お客様は {s.experience}</p>}
                <p className="text-[11px] text-ink-3 mt-1">{TAG_LABEL[s.tag] ?? "仮説"}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <p className="text-[12px] text-ink-3">これは、最初の{seeds.length}組です。</p>
            <div className="mt-2 grid grid-cols-10 gap-1.5 max-w-[360px]" aria-label="30組のうち見つかった数">
              {Array.from({ length: 30 }, (_, i) => (
                <span key={i} className={`h-[18px] rounded-[3px] ${i < seeds.length ? "bg-navy" : "border border-dashed border-ink-3"}`} />
              ))}
            </div>
            <p className="text-sm mt-3 max-w-[56ch]"><span className="font-semibold">残りは、御社の中にあります。</span>毎日ちがう角度の問いに答えるうちに、「言われてみれば、それもそうだ」が積み上がっていきます。目標は30組。面談では、その入口が見えただけです。</p>
          </div>
        </section>
      )}

      {brakes.length > 0 && (
        <section className="mt-14">
          <h2 className="serif text-[20px]">まだ言葉になっていないブレーキ</h2>
          <p className="text-sm text-ink-2 mt-1 max-w-[56ch]">お客様が御社を選ぶ直前に、おそらくこう迷っています。ここを言葉で先回りできると、見積りの前の会話が変わります。3〜5週目の仕事です。</p>
          <ul className="mt-5 space-y-3">
            {brakes.map((b, i) => (
              <li key={i} className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
                <p className="text-[11px] text-ink-3">{BRAKE_LABEL[b.kind] ?? b.kind}</p>
                <p className="serif text-[16px] mt-1">「{b.words}」</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm max-w-[56ch] pl-4 border-l-2 border-warm">
            <span className="font-semibold">ここを放っておくと、</span>御社は「比べられたら負ける会社」のままです。選ばれる時は値引きと相見積もりで選ばれ、選ばれない時は理由を教えてもらえません。
          </p>
        </section>
      )}

      {fit.length > 0 && (
        <section className="mt-14">
          <h2 className="serif text-[20px]">なぜ「つくれる」と判断したか</h2>
          <ul className="mt-5 space-y-4">
            {fit.map((f, i) => (
              <li key={i}>
                <p className="font-medium">{f.condition}</p>
                {f.quote && <p className="text-ink-2 mt-1 pl-4 border-l-2 hairline">{f.quote}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {comp && (
        <section className="mt-14">
          <h2 className="serif text-[20px]">{comp.name} が、いま言っていること</h2>
          <ul className="mt-4 space-y-2 text-ink-2">
            {comp.claims.map((c, i) => <li key={i} className="pl-4 border-l-2 hairline">{c}</li>)}
          </ul>
          <p className="text-sm text-ink-2 mt-4 max-w-[56ch]">向こうは言葉にしています。御社は、まだ言葉にしていないだけです。</p>
        </section>
      )}

      <section className="mt-14">
        <h2 className="serif text-[20px]">「選ばれる理由」をつくろうとして、多くの会社がやること</h2>
        <ol className="mt-5 space-y-3">
          {MISTAKES.map((m, i) => (
            <li key={i} className="grid grid-cols-[28px_1fr] gap-3 items-start">
              <span className="num text-[13px] text-ink-3 pt-0.5">{i + 1}</span>
              <div><p className="font-medium">{m.t}</p><p className="text-sm text-ink-2">{m.b}</p></div>
            </li>
          ))}
        </ol>
        <div className="mt-6 rounded-[var(--radius)] bg-navy-soft px-6 py-5 max-w-[60ch]">
          <p className="leading-relaxed">問題は、御社に理由がないことではありません。<span className="font-semibold">社内にある理由を、取り出す手順がないこと</span>です。</p>
          <p className="text-sm text-ink-2 mt-2">初回ヒアリングで{seeds.length > 0 ? `${seeds.length}組が` : "芽が"}見つかったのが、その証拠です。8週間プログラムは、その手順です。</p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="serif text-[20px]">{company.name}様が8週間でやること、3つ</h2>
        <ol className="mt-5 space-y-6">
          {STEPS3.map((x) => (
            <li key={x.n} className="grid grid-cols-[90px_1fr] gap-4">
              <div className="pt-0.5">
                <p className="serif text-[22px] leading-none">{x.n}</p>
                <p className="num text-[11px] text-ink-3 mt-1">{x.w}</p>
              </div>
              <div>
                <p className={`serif text-[18px] leading-snug ${x.n === "3" ? "text-warm" : ""}`}>{x.t}</p>
                <p className="text-sm text-ink-2 mt-1">{x.b}</p>
                <p className="text-[12px] text-ink-3 mt-1.5">{x.p}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {d.operator_note && (
        <section className="mt-14 rounded-[var(--radius)] bg-navy-soft px-6 py-5">
          <p className="text-[11px] font-semibold text-navy">ベレネッツ 平松より</p>
          <p className="mt-2 leading-relaxed whitespace-pre-line">{d.operator_note}</p>
        </section>
      )}

      <section className="mt-14 grid grid-cols-2 gap-4">
        <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
          <p className="text-[11px] text-ink-3">自力でやる場合</p>
          <p className="text-sm mt-2 leading-relaxed">30組を集めるには、毎日ちがう角度で問いを立てる人と、答えを「御社は〜できる。だから〜」の型に揃える人が要ります。社長ひとりで両方をやると、最初の数組で止まります。</p>
        </div>
        <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
          <p className="text-[11px] text-ink-3">8週間プログラムの場合</p>
          <p className="text-sm mt-2 leading-relaxed">問いはAIが毎日出します。揃えるのはベレネッツが面談で担います。社長がやるのは、答えることだけです。</p>
        </div>
        <p className="col-span-2 text-sm max-w-[60ch] pl-4 border-l-2 border-warm">
          <span className="font-semibold">初回ヒアリングで見つかった芽は、御社の「いま」の言葉です。</span>時間が経つほど、言い回しも熱量も薄れます。見つかったうちに、始めてください。
        </p>
      </section>

      <section className="mt-16 border-t hairline pt-8 print:hidden">
        <h2 className="serif text-[20px]">ここから、8週間が始まるまで</h2>
        <p className="text-sm text-ink-2 mt-1 max-w-[56ch]">契約と請求はメールでやりとりします。アプリでは、いまどこまで進んでいるかが見えます。</p>
        <ol className="mt-5 grid grid-cols-4 gap-2 text-[12px]">
          {steps.map((st, i) => (
            <li key={st.key} className={`rounded-[var(--radius)] border px-3 py-2.5 ${st.done ? "border-navy bg-navy text-white" : st.now ? "border-warm bg-warm-soft" : "hairline text-ink-3"}`}>
              <p className={`num text-[10px] tracking-wide ${st.done ? "text-white/70" : st.now ? "text-warm" : ""}`}>{i + 1}{st.done ? " ✓" : st.now ? " ← いまここ" : ""}</p>
              <p className="font-semibold mt-0.5">{st.label}</p>
              {st.at && <p className={`num text-[10px] mt-0.5 ${st.done ? "text-white/70" : "text-ink-3"}`}>{fmtMeeting(st.at)}</p>}
            </li>
          ))}
        </ol>

        <div className="mt-6">
          {!company.applied_at ? (
            <>
              <p className="text-sm">診断結果を読んで「進めたい」と思われたら、下のボタンを押してください。ベレネッツから申込書・契約書と請求書をメールでお送りします。</p>
              <form action={applyProgram} className="mt-4">
                <button className="btn-primary" type="submit">このプログラムに申し込む</button>
              </form>
              <p className="text-[12px] text-ink-3 mt-3">ボタンを押した時点では費用は発生しません。契約書の内容を確認してからのご契約です。</p>
            </>
          ) : !company.paid_at ? (
            <p className="text-sm">
              {company.contracted_at
                ? "ご契約ありがとうございます。入金を確認しだい、キックオフの日程をこの画面でお選びいただけます。"
                : "お申し込みを受け付けました。ベレネッツから申込書・契約書と請求書をメールでお送りします。届かない場合は「ベレネッツに質問を残す」からお知らせください。"}
            </p>
          ) : d.chosen_date ? (
            <p className="text-sm">キックオフは <span className="num font-semibold">{fmtMeeting(d.chosen_date)}</span> で承りました。ベレネッツから会議URLをお送りします。</p>
          ) : dates.length > 0 ? (
            <>
              <p className="text-sm">入金を確認しました。キックオフ（3時間・オンライン）の日を選んでください。</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {dates.map((iso) => (
                  <form key={iso} action={chooseKickoff}>
                    <input type="hidden" name="date" value={iso} />
                    <button className="btn-primary num" type="submit">{fmtMeeting(iso)}</button>
                  </form>
                ))}
              </div>
              <p className="text-[12px] text-ink-3 mt-3">どれも合わない場合は「ベレネッツに質問を残す」からご希望日をお知らせください。</p>
            </>
          ) : (
            <p className="text-sm">入金を確認しました。キックオフの候補日は、ベレネッツからご連絡します。</p>
          )}
        </div>
        <div className="mt-6 flex items-start gap-4">
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 border-warm bg-warm-soft text-warm text-[12px] font-bold px-3 py-1.5 whitespace-nowrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>
            半額返金保証
          </span>
          <p className="text-[13px] text-ink-2 leading-relaxed">
            費用は8週間で70万円（前払い・税別）。2週目の終わりの面談までに「違う」と感じられた場合は、半額を返金します。それ以降の返金はありません。
          </p>
        </div>
      </section>
    </article>
  );
}
