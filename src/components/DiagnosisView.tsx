import { oneMonthLaterJst, fmtApplyBy } from "@/lib/applyBy";
import Link from "next/link";
import { BRAKE_LABEL, TAG_LABEL } from "@/lib/diagnosis";
import { fmtMeeting } from "@/lib/meetings";
import { ProgramStart } from "@/components/ProgramStart";
import { PrintButton } from "@/components/PrintButton";

type Seed = { feature: string; experience: string; tag: string };
type Brake = { kind: string; words: string };
type Fit = { condition: string; quote: string };
export type DiagnosisCompany = { name: string; status: string; applied_at: string | null; contracted_at: string | null; paid_at: string | null };
export type DiagnosisData = Record<string, unknown> & { seeds?: unknown; brakes?: unknown; fit_reasons?: unknown; competitor?: unknown; candidate_dates?: unknown; one_liner_before?: string | null; summary?: string | null; risk_line?: string | null; operator_note?: string | null; published_at?: string | null; expires_at?: string | null; chosen_date?: string | null };

// 3ステップ。1・2は「やること」、3は「手に入る状態」
const STEPS3 = [
  { n: "1", w: "第0〜2週", t: "集める", b: "キックオフ（3時間）でAIが御社の資料とWebを読み、「御社はこういう会社です」を下書きします。そこから毎日ちがう角度の問いに答えるだけで、提供価値・体験価値が組になって増えます。社内で当たり前すぎて誰も言わなかったことが、言葉になります。2週目の終わりに面談で確認します。", p: "ポイント：考えて書くのではなく、問いに答える。答えられない日は飛ばしてかまいません。" },
  { n: "2", w: "第3〜5週", t: "裏づける", b: "お客様が買う直前に迷う理由を書き出し、先回りの答えを用意します。お客様の声・数字・事実で「なぜなら」をつけ、言葉が浮つかなくなります。中間チェックと、5週目の終わりの面談で確認します。", p: "ポイント：きれいな言葉より、証拠のある言葉。言えない組は、残しません。" },
  { n: "3", w: "第6〜8週", t: "比べられても、選ばれる", b: "営業トーク・価格説明・Web・採用の文章に展開します。見積りの前の会話で「なぜ御社か」を自分の言葉で言える状態になります。最後の面談で、冒頭の一言をもう一度答えていただきます。", p: "ポイント：言葉は御社のものです。ベレネッツが代わりに書いた言葉は、ひとつも残りません。" },
];


/**
 * お客様に見せる「適合診断の結果」の本体。お客様の画面と、ベレネッツのプレビューで同じものを使う。
 * preview のときは申込・日程のボタンを押せなくする。
 */
export function DiagnosisView({ company, d, preview = false, kickoff }: { company: DiagnosisCompany; d: DiagnosisData; preview?: boolean; kickoff?: { candidates: string[]; chosen: string | null } }) {
  const seeds = (d.seeds ?? []) as Seed[];
  const brakes = (d.brakes ?? []) as Brake[];
  const fit = (d.fit_reasons ?? []) as Fit[];
  const comp = (d.competitor ?? null) as { name: string; claims: string[] } | null;
  // 過ぎた候補日は出さない（全部過ぎていれば「ベレネッツからご連絡します」）
  // キックオフの候補日・確定日（結果ページの候補日と、面談に登録したキックオフの両方から）
  const chosenDate = kickoff ? kickoff.chosen : (d.chosen_date ?? null);
  const dates = kickoff ? kickoff.candidates : ((d.candidate_dates ?? []) as string[]).filter((iso) => new Date(iso) > new Date());
  // 運営が段階を飛ばして記録しても矛盾しないよう、後の段階が済んでいれば前の段階も済みとみなす
  const paid = !!company.paid_at;
  const contracted = paid || !!company.contracted_at;
  const applied = contracted || !!company.applied_at;
  const tagCls: Record<string, string> = { fact: "tag-fact", verify: "tag-verify", hypothesis: "tag-hypo" };
  // 項目番号（出ている項目だけで①から振る）
  // 申し込みの欄が出るのは、契約前（適合診断済み）でまだ申し込んでいないときだけ。目次・番号・案内文も同じ条件
  const showApply = company.status === "diagnosed" && !applied;
  const order = [d.one_liner_before ? "one-liner" : null, seeds.length ? "seeds" : null, brakes.length ? "brakes" : null, fit.length ? "why" : null, comp && comp.claims?.length ? "competitor" : null, "why-not-alone", "program", showApply ? "apply" : null].filter((x): x is string => !!x);
  const no = (key: string) => "①②③④⑤⑥⑦⑧⑨"[order.indexOf(key)] ?? "";
  // 申し込みの期限：閲覧期限（expires_at。公開時に空なら公開から1か月が入る）。公開前のプレビューでは、いま公開した場合の日付
  const applyByIso = (d.expires_at as string | null | undefined) || (d.published_at ? oneMonthLaterJst(d.published_at as string) : preview ? oneMonthLaterJst(new Date().toISOString()) : null);
  const applyBy = applyByIso ? fmtApplyBy(applyByIso) : null;

  return (
    <article className="max-w-[880px] print-root">
      {applied ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="inline-flex items-center gap-x-2 rounded-full bg-paper-2 text-ink-2 text-[13px] font-semibold tracking-wide px-4 py-1.5">適合診断の結果<span className="font-normal text-ink-3">── 振り返り用（契約前の初回ヒアリング）</span></p>
          {!preview && <Link href="/" className="text-[13px] underline underline-offset-4 text-ink-2 hover:text-ink">← ホーム（いまの進み具合）へ</Link>}
        </div>
      ) : (
        <p className="inline-flex flex-wrap items-center gap-x-2 rounded-full bg-navy text-on-accent text-[13px] font-semibold tracking-wide px-4 py-1.5">適合診断の結果<span className="font-normal text-on-accent/80">── 8週間で「選ばれる理由」を言葉にするプログラムに、御社が進めるかの判定</span></p>
      )}
      {/* 判定：左に「◎ 適合」のスタンプ、右に結論。社名は結論から外して上に小さく（結論が1行で読めるように） */}
      <div className="mt-6 flex items-center gap-4 sm:gap-6">
        <div aria-hidden className="shrink-0 -rotate-6 w-[84px] h-[84px] sm:w-[104px] sm:h-[104px] rounded-full border-[3px] border-warm text-warm flex flex-col items-center justify-center leading-none">
          <span className="text-[30px] sm:text-[38px]">◎</span>
          <span className="serif text-[15px] sm:text-[18px] tracking-[0.2em] pl-[0.2em] mt-1">適合</span>
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-ink-2">{company.name} 様<span className="sr-only">：判定 適合</span></p>
          <h1 className="serif text-[21px] sm:text-[28px] leading-snug mt-1 [word-break:keep-all] [overflow-wrap:anywhere]">
            <span className="text-warm">「選ばれる理由」</span>は、<wbr />もう御社の中に<wbr />あります。
          </h1>
          {seeds.length > 0 && <p className="text-[14px] text-ink-2 mt-1.5">初回ヒアリングで、すでに<span className="num font-semibold text-ink mx-0.5">{seeds.length}</span>組、選ばれる理由の候補が見つかりました。</p>}
        </div>
      </div>
      {d.summary && (
        <section className="mt-6 rounded-[var(--radius)] bg-navy text-on-accent px-6 sm:px-8 py-6">
          <p className="text-[11px] tracking-[0.2em] text-on-accent/70">エグゼクティブサマリー　── まず、ここだけお読みください</p>
          <div className="mt-3 space-y-3">
            {String(d.summary).split(/\n{2,}|\n/).map((t: string) => t.trim()).filter(Boolean).map((t: string, i: number) => (
              <p key={i} className={i === 0 ? "serif text-[19px] sm:text-[21px] leading-relaxed" : "text-[15px] leading-relaxed text-on-accent/90"}>{t}</p>
            ))}
          </div>
          {/* 下に診断の中身が続くことを示す目次。売り込みより先に「診断」を読んでもらう */}
          <nav aria-label="この結果の中身" className="mt-5 border-t border-on-accent/25 pt-4">
            <p className="text-[11px] tracking-[0.2em] text-on-accent/70">↓ この下に、診断の中身が続きます</p>
            <ol className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
              {[
                d.one_liner_before ? ["#one-liner", "「御社を一言で言うと？」── 面談でのお答え"] : null,
                seeds.length ? ["#seeds", `初回ヒアリングで、もう見つかった「選ばれる理由の候補」（${seeds.length}組）`] : null,
                brakes.length ? ["#brakes", `まだ言葉になっていない「顧客のブレーキ」（${brakes.length}つ）`] : null,
                fit.length ? ["#why", "なぜ選ばれる理由を「つくることができる」と判断したか"] : null,
                comp && comp.claims?.length ? ["#competitor", "競合が、いま言っていること"] : null,
                ["#why-not-alone", "なぜ、自社だけでは形にならないか"],
                ["#program", "ここから：8週間の流れと、残るもの"],
                showApply ? ["#apply", "申し込み・費用・次の一歩"] : null,
              ].filter((x): x is [string, string] => !!x).map(([href, label], i) => (
                <li key={href} className="flex gap-2"><span className="num text-on-accent/60 shrink-0">{i + 1}</span><a href={href} className="underline underline-offset-4 decoration-on-accent/40 hover:decoration-on-accent">{label}</a></li>
              ))}
            </ol>
          </nav>
        </section>
      )}


      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
        {d.published_at && <span className="num">{fmtMeeting(d.published_at)} 公開</span>}
        {d.expires_at && company.status === "diagnosed" && new Date(d.expires_at) > new Date() && <span>このページは <span className="num">{fmtMeeting(d.expires_at)}</span> まで</span>}
        <PrintButton />
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
          <p className="text-[11px] text-ink-3">初回ヒアリングで見えた、選ばれる理由の候補</p>
          <p className="serif text-[30px] leading-none mt-1"><span className="num">{seeds.length}</span><span className="text-[14px] ml-1">組</span></p>
        </div>
        <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
          <p className="text-[11px] text-ink-3">まだ言葉になっていない「顧客のブレーキ」</p>
          <p className="serif text-[30px] leading-none mt-1"><span className="num">{brakes.length}</span><span className="text-[14px] ml-1">つ</span></p>
        </div>
        <div className="rounded-[var(--radius)] bg-navy text-on-accent px-5 py-4">
          <p className="text-[11px] text-on-accent/70">8週間後に完成</p>
          <p className="serif text-[22px] leading-tight mt-1">御社の「選ばれる理由」一式</p>
          <p className="text-[12px] text-on-accent/80 mt-1"><span className="num">30</span>組を目標に出し、強いものに絞り込む</p>
        </div>
      </div>

      {/* ───────── 帯1：診断（御社のこと） ───────── */}
      {d.one_liner_before && (
        <section id="one-liner" className="mt-12 scroll-mt-6">
          <h2 className="serif sec-title"><span className="num text-ink-3 mr-2">{no("one-liner")}</span>「御社を一言で言うと？」</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <p className="text-sm text-ink-2 mt-4 max-w-[40em]">多くの会社で、左は業種と所在地の説明、右はお客様が選ぶ理由になります。同じ会社の、同じ人の言葉で。</p>
        </section>
      )}

      {seeds.length > 0 && (
        <section id="seeds" className="mt-14 scroll-mt-6">
          <h2 className="serif sec-title"><span className="num text-ink-3 mr-2">{no("seeds")}</span>初回ヒアリングで、もう見つかった「選ばれる理由の候補」</h2>
          <p className="text-sm text-ink-2 mt-1 max-w-[40em]">御社の中では当たり前すぎて、誰も言っていなかったこと。お話しいただいた言葉を「御社は〜できる。だから、お客様は〜と感じられる」の型に仮に置いたものです。まだ仮説です。8週間で事実にします。</p>
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
            <p className="text-sm"><span className="font-semibold">8週間で目標にするのは30組。</span>上の{seeds.length}組は、45分の面談で見つかった分です。</p>
            <div className="mt-2 grid grid-cols-10 gap-1.5 max-w-[360px]" aria-label={`目標30組のうち、面談で見つかった${seeds.length}組`}>
              {Array.from({ length: 30 }, (_, i) => (
                <span key={i} className={`h-[18px] rounded-[3px] ${i < seeds.length ? "bg-navy" : "border border-dashed border-ink-3"}`} />
              ))}
            </div>
            <p className="text-[11px] text-ink-3 mt-1.5"><span className="inline-block w-[10px] h-[10px] rounded-[2px] bg-navy align-middle mr-1" />面談で見つかった組（{seeds.length}）　<span className="inline-block w-[10px] h-[10px] rounded-[2px] border border-dashed border-ink-3 align-middle mr-1" />これから8週間で出す組（{30 - seeds.length}）</p>
          </div>
        </section>
      )}

      {brakes.length > 0 && (
        <section id="brakes" className="mt-14 scroll-mt-6">
          <h2 className="serif sec-title"><span className="num text-ink-3 mr-2">{no("brakes")}</span>まだ言葉になっていない「顧客のブレーキ」</h2>
          <p className="text-sm text-ink-2 mt-1 max-w-[40em]">お客様が御社を選ぶ直前に、おそらくこう迷っています。ここを言葉で先回りできると、見積りの前の会話が変わります。3〜5週目の仕事です。</p>
          <ul className="mt-5 space-y-3">
            {brakes.map((b, i) => (
              <li key={i} className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
                <p className="text-[11px] text-ink-3">{BRAKE_LABEL[b.kind] ?? b.kind}</p>
                <p className="serif text-[16px] mt-1">「{b.words}」</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fit.length > 0 && (
        <section id="why" className="mt-14 scroll-mt-6">
          <h2 className="serif sec-title"><span className="num text-ink-3 mr-2">{no("why")}</span>なぜ選ばれる理由を「つくることができる」と判断したか</h2>
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

      {comp && comp.claims?.length > 0 && (
        <section id="competitor" className="mt-14 scroll-mt-6">
          <h2 className="serif sec-title"><span className="num text-ink-3 mr-2">{no("competitor")}</span>{comp.name?.trim() || "競合他社"} が、いま言っていること</h2>
          <ul className="mt-4 space-y-2 text-ink-2">
            {comp.claims.map((c, i) => <li key={i} className="pl-4 border-l-2 hairline">{c}</li>)}
          </ul>
          <p className="text-sm text-ink-2 mt-4 max-w-[40em]">向こうは言葉にしています。御社は、まだ言葉にしていないだけです。</p>
        </section>
      )}

      {/* 帯1の締め：放っておくとどうなるか（面談で出た具体的な場面。ベレネッツが書く／AIの下書き） */}
      <div className="mt-10 max-w-[42em] pl-4 border-l-2 border-warm">
        <p className="text-sm"><span className="font-semibold">ここを放っておくと、</span>{d.risk_line?.trim() || "御社は「比べられたら負ける会社」のままです。選ばれる時は値引きと相見積もりで選ばれ、選ばれない時は理由を教えてもらえません。"}</p>
        {showApply && <p className="text-[12px] text-ink-3 mt-2">費用とお申し込みは、このページのいちばん下にあります。</p>}
      </div>

      {/* ───────── 帯2：なぜ自社だけでは形にならないか ───────── */}
      <section id="why-not-alone" className="mt-14 scroll-mt-6 rounded-[var(--radius)] bg-navy-soft px-6 sm:px-8 py-6">
        <h2 className="serif sec-title"><span className="num text-ink-3 mr-2">{no("why-not-alone")}</span>なぜ、自社だけでは形にならないか</h2>
        <p className="mt-4 leading-relaxed max-w-[42em]"><span className="font-semibold">残りの選ばれる理由は、御社の中にあります。ただし、中にいる人には見えません。</span>当たり前にやっていることは、価値だと思えないからです。{seeds.length > 0 ? `初回ヒアリングの45分で${seeds.length}組が見つかったのは、外から問われたからです。` : ""}</p>
        <p className="mt-3 leading-relaxed max-w-[42em]">もう一つ、日々の仕事の中では、言葉を決める作業は後回しになります。社内で会議をしても「品質・納期・対応力」で止まり、制作会社に頼めば他社でも言える言葉になります。</p>
        <p className="mt-3 leading-relaxed max-w-[42em]">だから、毎日ひとつの問いが届き、節目ごとにベレネッツが面談で確かめます。8週間で面談は5回。最初の3時間は代表が直接行います。御社の担当の方がやるのは、答えることだけです。</p>
      </section>

      {/* ───────── 帯3：ここから（8週間の流れ・残るもの・申し込み） ───────── */}
      <section id="program" className="mt-14 scroll-mt-6">
        <h2 className="serif sec-title"><span className="num text-ink-3 mr-2">{no("program")}</span>ここから：8週間の流れと、御社がやること</h2>
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
        <ol className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px] print-two-col" aria-label="ベレネッツとの面談5回">
          {[
            ["キックオフ", "3時間", "代表が直接"],
            ["確認①", "2週目末", "候補を確定"],
            ["中間チェック", "3週目末", "詰まりを解く"],
            ["確認②", "5週目末", "順位を確定"],
            ["確認③", "8週目末", "全体を確定"],
          ].map(([t, w, b], i) => (
            <li key={t} className="rounded-[var(--radius)] border border-navy bg-navy-soft px-3 py-2.5">
              <p className="num text-[10px] tracking-wide text-navy">{i + 1}　{w}</p>
              <p className="font-semibold mt-0.5">{t}</p>
              <p className="text-[11px] text-ink-2 mt-0.5">{b}</p>
            </li>
          ))}
        </ol>
        <p className="text-[13px] text-ink-2 mt-3 max-w-[42em]">面談で確定した言葉には「封」をして、以降は変えません。だから8週間で、完成します。</p>

        <h3 className="serif text-[18px] mt-10">8週間後に、御社に残るもの</h3>
        <div className="mt-3 rounded-[var(--radius)] border-2 border-warm px-5 py-5">
          <p className="text-[11px] font-semibold tracking-wide text-warm">8週間の契約に含まれるもの　── 御社の「選ばれる理由」一式をダウンロード</p>
          <p className="text-[13px] text-ink-2 mt-2 leading-relaxed max-w-[42em]">「御社は〜できる。だから、お客様は〜と感じられる。なぜなら〜」で書かれた選ばれる理由と、お客様のブレーキへの先回りの答え、裏づけの証拠、営業トーク・価格説明・Web・採用に使う形にしたもの。ベレネッツではこの一式を「脚本」と呼んでいます。Excelと文書でお渡しし、御社の体制でそのまま使えます。通常は、ここまでが8週間の成果物です。</p>
        </div>

        {/* 真骨頂：御社専用AI。一式を覚えたAIが、以後の文章を御社の言葉で書き続ける */}
        <div className="mt-4 rounded-[var(--radius)] bg-navy text-on-accent px-5 sm:px-7 py-6">
          <p className="text-[11px] font-semibold tracking-[0.15em] text-on-accent/70">オプション（継続契約）　── 御社専用の「脳」ができる</p>
          <p className="serif text-[21px] sm:text-[24px] leading-snug mt-2">完成した一式を覚えた、<br className="sm:hidden" />御社専用にカスタマイズしたAIを使い続けられます。</p>
          <p className="text-[14px] leading-relaxed mt-3 text-on-accent/90 max-w-[42em]">8週間で完成した御社の「選ばれる理由」と、ベレネッツが25年・750社で積み上げた進め方と勝ちパターンを、御社専用にベレネッツがカスタマイズしたAIです。一般のAIに「うちの強みを書いて」と頼むのとは違い、出てくる言葉はすべて御社の選ばれる理由に沿い、根拠のないことは書きません。社内の誰が使っても、同じ言葉で出てきます。</p>
          <p className="text-[11px] text-on-accent/70 mt-4">御社の言葉で、こういうものが出てきます</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {["営業トーク・提案書", "価格・見積の説明", "Webサイト・LPの文章", "広告・チラシ・パンフレット", "メルマガ・DM", "プレスリリース", "動画のシナリオ", "SNSの発信", "セミナー・展示会の原稿", "採用の文章（求人・面接・会社説明）", "社内への浸透（朝礼・研修）", "新商品・新サービスの打ち出し方", "クレーム・失注への返答"].map((t) => (
              <li key={t} className="rounded-full border border-on-accent/40 px-3 py-1 text-[13px]">{t}</li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-[var(--radius)] bg-paper text-ink px-4 py-4">
              <p className="text-[11px] font-semibold tracking-wide text-warm">御社側で、AIを契約する必要はありません</p>
              <p className="text-[13px] leading-relaxed mt-1.5">ベレネッツが用意したAIを、ブラウザで開くだけ。指示文を書いたり、設定を覚えたりする必要もありません。御社のデータが一般のAIの学習に使われることもありません。</p>
            </div>
            <div className="rounded-[var(--radius)] bg-paper text-ink px-4 py-4">
              <p className="text-[11px] font-semibold tracking-wide text-warm">使うほど、御社らしくなります</p>
              <p className="text-[13px] leading-relaxed mt-1.5">ベレネッツが、脳科学・行動科学の知見と、積み上がり続ける成功パターンをこのAIに学ばせ続けます。御社の選ばれる理由そのものも、顧問の面談で更新していきます。契約した日より、半年後のほうが賢い。</p>
            </div>
          </div>
          <p className="text-[12px] text-on-accent/70 mt-4">8週間の契約だけでも、一式はすべて御社のものとしてお渡しします。このAIは、そのうえで「使い続け、育て続ける」ためのオプション（月額の継続契約）です。費用はご希望の場合に別途ご案内します。</p>
        </div>
      </section>

      {d.operator_note && (
        <section className="mt-14 rounded-[var(--radius)] bg-navy-soft px-6 py-5">
          <p className="text-[11px] font-semibold text-navy">ベレネッツ 平松より</p>
          <p className="mt-2 leading-relaxed whitespace-pre-line">{d.operator_note}</p>
        </section>
      )}

      {showApply && (
        <section id="apply" className="mt-16 scroll-mt-6">
          <h2 className="serif sec-title"><span className="num text-ink-3 mr-2">{no("apply")}</span>申し込み・費用・次の一歩</h2>
          <div className="mt-4 max-w-[42em] pl-4 border-l-2 border-warm text-sm leading-relaxed">
            <p><span className="font-semibold">初回ヒアリングで見つかった候補は、御社の「いま」の言葉です。</span>時間が経つほど、言い回しも熱量も薄れます。</p>
            <p className="mt-1">お申し込みは、この結果の公開から<span className="font-semibold">1か月以内</span>{applyBy ? <>（<span className="num font-semibold">{applyBy}</span>まで）</> : null}にお願いします。申し込むと2営業日以内に契約書と請求書が届き、入金の確認後にこの画面でキックオフの日を選べます。</p>
            <p className="mt-1">費用と返金保証は、下の申し込みボタンのすぐ下にあります。オプションの御社専用AIは別料金（月額）で、ご希望の場合に別途ご案内します。</p>
          </div>
          <ProgramStart company={company} chosenDate={chosenDate} dates={dates} expiresAt={d.expires_at ?? null} preview={preview} />
        </section>
      )}
      {(company.status !== "diagnosed" || applied) && (
        <p className="mt-16 border-t hairline pt-6 text-sm text-ink-2 max-w-[40em] print:hidden">
          これは契約前の初回ヒアリングでの診断結果です。ここで見つかった候補とブレーキは、8週間のステップの出発点になります。最後の面談で、「御社を一言で言うと？」にもう一度答えていただきます。
        </p>
      )}
    </article>
  );
}
