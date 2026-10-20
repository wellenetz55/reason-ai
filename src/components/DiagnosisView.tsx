import { BRAKE_LABEL, TAG_LABEL } from "@/lib/diagnosis";
import { fmtMeeting } from "@/lib/meetings";
import { chooseKickoff, applyProgram } from "@/app/(app)/diagnosis/actions";
import { PrintButton } from "@/components/PrintButton";
import { Download, Users, Bot } from "lucide-react";

type Seed = { feature: string; experience: string; tag: string };
type Brake = { kind: string; words: string };
type Fit = { condition: string; quote: string };
export type DiagnosisCompany = { name: string; status: string; applied_at: string | null; contracted_at: string | null; paid_at: string | null };
export type DiagnosisData = Record<string, unknown> & { seeds?: unknown; brakes?: unknown; fit_reasons?: unknown; competitor?: unknown; candidate_dates?: unknown; one_liner_before?: string | null; summary?: string | null; operator_note?: string | null; published_at?: string | null; expires_at?: string | null; chosen_date?: string | null };

// 3ステップ。1・2は「やること」、3は「手に入る状態」
const STEPS3 = [
  { n: "1", w: "第0〜2週", t: "集める", b: "キックオフ（3時間）でAIが御社の資料とWebを読み、「御社はこういう会社です」を下書きします。そこから毎日ちがう角度の問いに答えるだけで、提供価値・体験価値が組になって増えます。社内で当たり前すぎて誰も言わなかったことが、言葉になります。2週目の終わりに面談で確認します。", p: "ポイント：考えて書くのではなく、問いに答える。答えられない日は飛ばしてかまいません。" },
  { n: "2", w: "第3〜5週", t: "裏づける", b: "お客様が買う直前に迷う理由を書き出し、先回りの答えを用意します。お客様の声・数字・事実で「なぜなら」をつけ、言葉が浮つかなくなります。中間チェックと、5週目の終わりの面談で確認します。", p: "ポイント：きれいな言葉より、証拠のある言葉。言えない組は、残しません。" },
  { n: "3", w: "第6〜8週", t: "比べられても、選ばれる", b: "営業トーク・価格説明・Web・採用の文章に展開します。見積りの前の会話で「なぜ御社か」を自分の言葉で言える状態になります。最後の面談で、冒頭の一言をもう一度答えていただきます。", p: "ポイント：言葉は御社のものです。ベレネッツが代わりに書いた言葉は、ひとつも残りません。" },
];

// 「選ばれる理由」をつくろうとして、多くの会社がやること
const MISTAKES = [
  { t: "社内で会議して考える", b: "出てくるのは「品質・納期・対応力」。どの会社も言える言葉です。" },
  { t: "制作会社やライターに頼む", b: "きれいになります。ただ、他社でも言える言葉になります。" },
  { t: "ホームページを作り直す", b: "見た目は変わります。言葉が変わっていないので、結果は変わりません。" },
];


/**
 * お客様に見せる「適合診断の結果」の本体。お客様の画面と、ベレネッツのプレビューで同じものを使う。
 * preview のときは申込・日程のボタンを押せなくする。
 */
export function DiagnosisView({ company, d, preview = false }: { company: DiagnosisCompany; d: DiagnosisData; preview?: boolean }) {
  const seeds = (d.seeds ?? []) as Seed[];
  const brakes = (d.brakes ?? []) as Brake[];
  const fit = (d.fit_reasons ?? []) as Fit[];
  const comp = (d.competitor ?? null) as { name: string; claims: string[] } | null;
  // 過ぎた候補日は出さない（全部過ぎていれば「ベレネッツからご連絡します」）
  const dates = ((d.candidate_dates ?? []) as string[]).filter((iso) => new Date(iso) > new Date());
  // 運営が段階を飛ばして記録しても矛盾しないよう、後の段階が済んでいれば前の段階も済みとみなす
  const paid = !!company.paid_at;
  const contracted = paid || !!company.contracted_at;
  const applied = contracted || !!company.applied_at;
  const steps = [
    { key: "apply", label: "申し込む", at: company.applied_at, done: applied, now: !applied },
    { key: "contract", label: "契約書を取り交わす", at: company.contracted_at, done: contracted, now: applied && !contracted },
    { key: "pay", label: "入金", at: company.paid_at, done: paid, now: contracted && !paid },
    { key: "kickoff", label: "キックオフ日を選ぶ", at: d.chosen_date, done: paid && !!d.chosen_date, now: paid && !d.chosen_date },
  ];
  const tagCls: Record<string, string> = { fact: "tag-fact", verify: "tag-verify", hypothesis: "tag-hypo" };

  return (
    <article className="max-w-[880px]">
      <p className="inline-flex flex-wrap items-center gap-x-2 rounded-full bg-navy text-on-accent text-[13px] font-semibold tracking-wide px-4 py-1.5">適合診断の結果<span className="font-normal text-on-accent/80">── 8週間でつくる「選ばれる理由の脚本」に、御社が進めるかの判定</span></p>
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
          {seeds.length > 0 && <p className="text-[14px] text-ink-2 mt-1.5">初回ヒアリングで、すでに<span className="num font-semibold text-ink mx-0.5">{seeds.length}</span>組の芽が見つかりました。</p>}
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
        </section>
      )}

      {/* 何が完成し、何が残るか。「診断ソフト」ではなく、AI＋ベレネッツで完成品をつくるプログラムだと最初に示す */}
      <section className="mt-6 rounded-[var(--radius)] border-2 border-warm px-6 sm:px-8 py-6">
        <h2 className="serif sec-title">8週間で、御社に残るもの</h2>
        <p className="text-sm text-ink-2 mt-2 max-w-[42em]">これは診断ソフトではありません。終わったとき、御社には「完成品」が残ります。</p>

        {/* 全体の流れ：脚本の言語化 → ダウンロード → 上演（2通り）。縦に読む図 */}
        <div className="mt-6 rounded-[var(--radius)] border hairline bg-paper px-4 sm:px-6 py-6" aria-label="8週間とその先の流れ">
          <div className="rounded-[var(--radius)] bg-navy text-on-accent px-6 py-6 text-center">
            <p className="text-[11px] tracking-[0.2em] text-on-accent/60">STEP 01　|　初期契約・8週間</p>
            <p className="serif text-[24px] sm:text-[26px] leading-tight mt-2">脚本の言語化</p>
            <p className="serif text-[18px] leading-tight mt-1">「ネタの決定」</p>
            <p className="text-[13px] text-on-accent/85 mt-3">御社ならではの価値・強み・伝えるべき物語を明確にする。AIが毎日の問い、ベレネッツが5回の面談で確定。</p>
          </div>

          <div className="text-center mt-3">
            <p className="text-ink-3 text-[18px] leading-none" aria-hidden>↓</p>
            <p className="mt-2 inline-flex items-center gap-2 text-[15px] font-semibold"><Download size={16} strokeWidth={1.75} aria-hidden />完成した脚本をダウンロード</p>
            <p className="text-[12px] text-ink-3 mt-1">ここで初期契約の成果物が完成。すべて御社のものに</p>
          </div>

          <div className="border-t hairline mt-5 pt-6 text-center">
            <p className="serif text-[20px] sm:text-[22px] leading-tight">上演方法は、2つから選択できます</p>
            <p className="text-[12px] text-ink-3 mt-1">上演＝社内への浸透とマーケティング。脚本を「使う」段階です</p>
            <svg className="mx-auto mt-3 text-ink-3" width="240" height="36" viewBox="0 0 240 36" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M120 0v10M40 10h160M40 10v26M200 10v26M34 30l6 6 6-6M194 30l6 6 6-6" />
            </svg>
          </div>

          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-5 flex flex-col">
              <p className="text-[11px] tracking-[0.15em] text-ink-3">OPTION A</p>
              <p className="serif text-[22px] leading-tight mt-1">自社で上演</p>
              <p className="text-[12px] text-ink-3 mt-1">継続契約は不要</p>
              <Users size={20} strokeWidth={1.75} className="mt-4 text-ink-2" aria-hidden />
              <p className="text-[13px] mt-2 leading-relaxed">ダウンロードした脚本をもとに、御社の体制で実行する</p>
              <ul className="border-t hairline mt-4 pt-3 text-[13px] space-y-2">
                <li>社内への浸透戦略</li>
                <li>マーケティング戦略</li>
              </ul>
              <p className="text-[12px] text-ink-3 mt-auto pt-4">自社のペースと体制で活用</p>
            </div>
            <div className="rounded-[var(--radius)] border-2 border-warm bg-paper px-5 py-5 flex flex-col">
              <p className="text-[11px] tracking-[0.15em] text-warm">OPTION B</p>
              <p className="serif text-[22px] leading-tight mt-1">御社専用AIと上演</p>
              <p className="text-[12px] text-warm mt-1">別途・継続契約</p>
              <Bot size={20} strokeWidth={1.75} className="mt-4 text-warm" aria-hidden />
              <p className="text-[13px] mt-2 leading-relaxed">ネタ（脚本）を完全に学習した貴社専用AIを活用。コピー・営業トーク・Web文章・広告素材・動画シナリオ・SNS・採用の文章まで、御社専用で出てくる</p>
              <ul className="border-t hairline mt-4 pt-3 text-[13px] space-y-2">
                <li>社内への浸透戦略</li>
                <li>マーケティング戦略</li>
              </ul>
              <p className="text-[12px] text-warm mt-auto pt-4">AIの契約は不要。どんどん賢くなる</p>
            </div>
          </div>
          <p className="text-[12px] text-ink-3 text-center mt-4">どちらを選んでも、完成した脚本は御社の資産として活用できます。</p>
        </div>

        <div className="mt-5 rounded-[var(--radius)] bg-warm-soft px-5 py-4">
          <p className="text-[11px] font-semibold tracking-wide text-warm">完成品</p>
          <p className="serif text-[20px] sm:text-[22px] leading-snug mt-1">選ばれる理由の脚本（提供価値シート）</p>
          <p className="text-[14px] leading-relaxed mt-2 max-w-[42em]">「御社は〜できる。だから、お客様は〜と感じられる。なぜなら〜」の三連で書かれた、御社の「選ばれる理由」。まず<span className="num font-semibold">30</span>組を目標に広く出し、リトマス試験紙やマグニチュード（強さの採点）で、本当に強いものだけに絞り込みます。残る数は会社によって違います。数ではなく、「比べられても、これで選ばれる」と言い切れる言葉が残ります。ベレネッツとの面談で一つずつ確定（封）した、御社の言葉だけで書かれたものです。</p>
        </div>

        <p className="text-[11px] text-ink-3 mt-5">8週間の終わりに、すべてダウンロードできます</p>
        <ol className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <li className="rounded-[var(--radius)] bg-paper-2 px-4 py-4">
            <p className="num text-[11px] text-ink-3">1</p>
            <p className="serif text-[16px] leading-snug mt-1">完成した提供価値シート</p>
            <p className="text-[13px] text-ink-2 mt-2 leading-relaxed">御社の「選ばれる理由」の原本。全列のExcelでお渡しします。</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {["三連の全文", "根拠の印（事実／要確認／仮説）", "削った行と、その理由", "競合比較", "お客様の声の分類", "未回収の宿題"].map((t) => <li key={t} className="rounded-full bg-paper border hairline px-2.5 py-0.5 text-[12px]">{t}</li>)}
            </ul>
          </li>
          <li className="rounded-[var(--radius)] bg-paper-2 px-4 py-4">
            <p className="num text-[11px] text-ink-3">2</p>
            <p className="serif text-[16px] leading-snug mt-1">選ばれる理由のまとめ一式（活用パッケージ）</p>
            <p className="text-[13px] text-ink-2 mt-2 leading-relaxed">脚本を、実際に使う場面の形にしたもの。そのまま現場で使えます。</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {["接点マップ", "営業トーク台本", "価格説明", "Web原稿", "採用の言葉", "見積の言葉", "社内共有用1枚", "月次運用の型"].map((t) => <li key={t} className="rounded-full bg-paper border hairline px-2.5 py-0.5 text-[12px]">{t}</li>)}
            </ul>
          </li>
        </ol>

        {/* その先：継続契約で開く、自社専用のブランディング・マーケティングAI */}
        <div className="mt-5 rounded-[var(--radius)] bg-navy text-on-accent px-5 sm:px-6 py-5">
          <p className="text-[11px] tracking-[0.2em] text-on-accent/70">OPTION B　── 御社専用AIと上演する</p>
          <p className="serif text-[19px] sm:text-[21px] leading-snug mt-1">継続契約で、御社専用の<br className="sm:hidden" />ブランディング・マーケティングAIが開きます。</p>
          <p className="text-[14px] leading-relaxed mt-3 text-on-accent/90 max-w-[42em]">ベレネッツが25年・750社で積み上げたマーケティングのノウハウと成功パターンが入ったAIに、8週間で完成した御社の「勝ちパターン（選ばれる理由の脚本）」が統合されます。一般的なAIに頼むのとは違い、出てくる言葉はすべて御社の脚本に沿ったものです。</p>
          <p className="text-[11px] text-on-accent/70 mt-4">御社専用で出てくるもの（一例）</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {["コピーライティング", "営業トーク・提案書", "価格・見積の説明", "Webサイト・LPの文章", "広告・チラシ・パンフレット", "メルマガ・DM", "プレスリリース", "動画シナリオ", "SNS発信コンテンツ", "セミナー・展示会の原稿", "採用の文章（求人・面接・会社説明）", "社内への浸透（朝礼・研修・評価の言葉）", "お客様の声の整理", "新商品・新サービスの打ち出し方", "クレーム・失注への返答"].map((t) => (
              <li key={t} className="rounded-full border border-on-accent/40 px-3 py-1 text-[13px]">{t}</li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-[var(--radius)] bg-paper text-ink px-4 py-4">
              <p className="text-[11px] font-semibold tracking-wide text-warm">AIの契約は、要りません</p>
              <p className="text-[13px] leading-relaxed mt-1.5">ブラウザで開くだけ。ChatGPTやClaudeなどを御社で契約していなくても、そのまま使えます。社内の誰が使っても、出てくる言葉は御社の脚本に沿います。</p>
            </div>
            <div className="rounded-[var(--radius)] bg-paper text-ink px-4 py-4">
              <p className="text-[11px] font-semibold tracking-wide text-warm">どんどん、賢くなります</p>
              <p className="text-[13px] leading-relaxed mt-1.5">ベレネッツが、脳科学・行動科学の知見や、積み上がり続ける成功パターンを、このAIに学ばせ続けます。契約した日より、半年後のAIのほうが賢い。御社の脚本そのものも、顧問の面談で更新していきます。</p>
            </div>
          </div>
          <p className="text-[12px] text-on-accent/70 mt-4">8週間の成果物はすべて御社のものとしてお渡しします。継続契約（顧問）は、そのうえで「使い続け、育て続ける」ための選択肢です。</p>
        </div>

        <div className="mt-6">
          <p className="serif text-[17px] leading-snug">つくり方：AIが毎日の問いと下書き、ベレネッツが<span className="num">5</span>回の面談で確定。</p>
          <ol className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px]">
            {[
              ["キックオフ", "3時間", "代表が直接"],
              ["確認①", "2週目末", "①〜③を確定"],
              ["中間チェック", "3週目末", "詰まりを解く"],
              ["確認②", "5週目末", "順位・競合優位を確定"],
              ["確認③", "8週目末", "全列を確定・運用設計"],
            ].map(([t, w, b], i) => (
              <li key={t} className="rounded-[var(--radius)] border border-navy bg-navy-soft px-3 py-2.5">
                <p className="num text-[10px] tracking-wide text-navy">{i + 1}　{w}</p>
                <p className="font-semibold mt-0.5">{t}</p>
                <p className="text-[11px] text-ink-2 mt-0.5">{b}</p>
              </li>
            ))}
          </ol>
          <p className="text-[13px] text-ink-2 mt-3 max-w-[42em]">面談で確定した言葉には「封」をして、以降は変えません。だから8週間で、完成します。</p>
        </div>
      </section>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-3">
        {d.published_at && <span className="num">{fmtMeeting(d.published_at)} 公開</span>}
        {d.expires_at && company.status === "diagnosed" && new Date(d.expires_at) > new Date() && <span>このページは <span className="num">{fmtMeeting(d.expires_at)}</span> まで</span>}
        <PrintButton />
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
          <p className="text-[11px] text-ink-3">初回ヒアリングで見えた芽</p>
          <p className="serif text-[30px] leading-none mt-1"><span className="num">{seeds.length}</span><span className="text-[14px] ml-1">組</span></p>
        </div>
        <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
          <p className="text-[11px] text-ink-3">まだ言葉になっていないブレーキ</p>
          <p className="serif text-[30px] leading-none mt-1"><span className="num">{brakes.length}</span><span className="text-[14px] ml-1">つ</span></p>
        </div>
        <div className="rounded-[var(--radius)] bg-navy text-on-accent px-5 py-4">
          <p className="text-[11px] text-on-accent/70">8週間後に完成</p>
          <p className="serif text-[22px] leading-tight mt-1">選ばれる理由の脚本</p>
          <p className="text-[12px] text-on-accent/80 mt-1"><span className="num">30</span>組を目標に出し、強いものに絞り込む</p>
        </div>
      </div>

      {d.one_liner_before && (
        <section className="mt-12">
          <h2 className="serif sec-title">「御社を一言で言うと？」</h2>
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
        <section className="mt-14">
          <h2 className="serif sec-title">初回ヒアリングで、もう見つかったもの</h2>
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
            <p className="text-[12px] text-ink-3">これは、最初の{seeds.length}組です。</p>
            <div className="mt-2 grid grid-cols-10 gap-1.5 max-w-[360px]" aria-label="30組のうち見つかった数">
              {Array.from({ length: 30 }, (_, i) => (
                <span key={i} className={`h-[18px] rounded-[3px] ${i < seeds.length ? "bg-navy" : "border border-dashed border-ink-3"}`} />
              ))}
            </div>
            <p className="text-sm mt-3 max-w-[40em]"><span className="font-semibold">残りは、御社の中にあります。</span>毎日ちがう角度の問いに答えるうちに、「言われてみれば、それもそうだ」が積み上がっていきます。まず30組を目標に出し、そこから強いものに絞り込みます。面談では、その入口が見えただけです。</p>
          </div>
        </section>
      )}

      {brakes.length > 0 && (
        <section className="mt-14">
          <h2 className="serif sec-title">まだ言葉になっていないブレーキ</h2>
          <p className="text-sm text-ink-2 mt-1 max-w-[40em]">お客様が御社を選ぶ直前に、おそらくこう迷っています。ここを言葉で先回りできると、見積りの前の会話が変わります。3〜5週目の仕事です。</p>
          <ul className="mt-5 space-y-3">
            {brakes.map((b, i) => (
              <li key={i} className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
                <p className="text-[11px] text-ink-3">{BRAKE_LABEL[b.kind] ?? b.kind}</p>
                <p className="serif text-[16px] mt-1">「{b.words}」</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm max-w-[40em] pl-4 border-l-2 border-warm">
            <span className="font-semibold">ここを放っておくと、</span>御社は「比べられたら負ける会社」のままです。選ばれる時は値引きと相見積もりで選ばれ、選ばれない時は理由を教えてもらえません。
          </p>
        </section>
      )}

      {fit.length > 0 && (
        <section className="mt-14">
          <h2 className="serif sec-title">なぜ「つくれる」と判断したか</h2>
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
        <section className="mt-14">
          <h2 className="serif sec-title">{comp.name?.trim() || "競合他社"} が、いま言っていること</h2>
          <ul className="mt-4 space-y-2 text-ink-2">
            {comp.claims.map((c, i) => <li key={i} className="pl-4 border-l-2 hairline">{c}</li>)}
          </ul>
          <p className="text-sm text-ink-2 mt-4 max-w-[40em]">向こうは言葉にしています。御社は、まだ言葉にしていないだけです。</p>
        </section>
      )}

      <section className="mt-14">
        <h2 className="serif sec-title">「選ばれる理由」をつくろうとして、多くの会社がやること</h2>
        <ol className="mt-5 space-y-3">
          {MISTAKES.map((m, i) => (
            <li key={i} className="grid grid-cols-[28px_1fr] gap-3 items-start">
              <span className="num text-[13px] text-ink-3 pt-0.5">{i + 1}</span>
              <div><p className="font-medium">{m.t}</p><p className="text-sm text-ink-2">{m.b}</p></div>
            </li>
          ))}
        </ol>
        <div className="mt-6 rounded-[var(--radius)] bg-navy-soft px-6 py-5 max-w-[40em]">
          <p className="leading-relaxed">問題は、御社に理由がないことではありません。<span className="font-semibold">社内にある理由を、取り出す手順がないこと</span>です。</p>
          <p className="text-sm text-ink-2 mt-2">{seeds.length > 0 ? `初回ヒアリングの短い時間でも${seeds.length}組が見つかったのが、その証拠です。` : ""}8週間プログラムは、その手順です。</p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="serif sec-title">{company.name}様が8週間でやること、3つ</h2>
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

      {company.status === "diagnosed" && (<>
      <section className="mt-16">
        <h2 className="serif sec-title">ここから、{company.name}様には<span className="text-warm">2つの道</span>があります。</h2>
        <p className="text-sm text-ink-2 mt-2 max-w-[40em]">見つかった芽を広げ、強いものに絞り込み、「選ばれる理由」として言い切れる形にする。やることは同じです。違うのは、誰が問いを立て、誰が揃えるかです。</p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-5">
          <p className="serif text-[20px] leading-tight"><span className="num text-[13px] font-semibold tracking-wide text-ink-3 block mb-1">道 1</span>自力でやる場合</p>
          <p className="text-sm mt-2 leading-relaxed">広く出して絞り込むには、毎日ちがう角度で問いを立てる人と、答えを「御社は〜できる。だから〜」の型に揃え、強さを見極める人が要ります。担当の方がひとりで両方をやると、最初の数組で止まります。</p>
        </div>
        <div className="rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-5 py-5">
          <p className="serif text-[20px] leading-tight text-warm"><span className="num text-[13px] font-semibold tracking-wide block mb-1">道 2</span>8週間プログラムの場合</p>
          <p className="text-sm mt-2 leading-relaxed">問いはAIが毎日出します。揃えるのはベレネッツが面談で担います。御社の担当の方がやるのは、答えることだけです。経営者でも、現場の方でも進められます。</p>
        </div>
        <p className="sm:col-span-2 text-sm max-w-[40em] pl-4 border-l-2 border-warm">
          <span className="font-semibold">初回ヒアリングで見つかった芽は、御社の「いま」の言葉です。</span>時間が経つほど、言い回しも熱量も薄れます。見つかったうちに、始めてください。
        </p>
        </div>
      </section>

      <section className="mt-16 border-t hairline pt-8 print:hidden">
        <h2 className="serif sec-title">ここから、8週間が始まるまで</h2>
        <p className="text-sm text-ink-2 mt-1 max-w-[40em]">契約と請求はメールでやりとりします。アプリでは、いまどこまで進んでいるかが見えます。</p>
        <ol className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
          {steps.map((st, i) => (
            <li key={st.key} className={`rounded-[var(--radius)] border px-3 py-2.5 ${st.done ? "border-navy bg-navy text-on-accent" : st.now ? "border-warm bg-warm-soft" : "hairline text-ink-3"}`}>
              <p className={`num text-[10px] tracking-wide ${st.done ? "text-on-accent/70" : st.now ? "text-warm" : ""}`}>{i + 1}{st.done ? " ✓" : st.now ? " ← いまここ" : ""}</p>
              <p className="font-semibold mt-0.5">{st.label}</p>
              {st.at && <p className={`num text-[10px] mt-0.5 ${st.done ? "text-on-accent/70" : "text-ink-3"}`}>{fmtMeeting(st.at)}</p>}
            </li>
          ))}
        </ol>

        {/* キックオフの重み：全部AIではなく、最初の3時間は代表が直接行う。中身を具体的に見せて期待感をつくる */}
        <div className="mt-8 rounded-[var(--radius)] border-2 border-navy bg-navy-soft px-6 sm:px-8 py-6">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-navy">8週間は、ここから始まります</p>
          <h3 className="serif text-[22px] sm:text-[24px] leading-snug mt-2">キックオフ（3時間・オンライン）は、<br className="hidden sm:block" />ベレネッツ代表の平松が直接行います。</h3>
          <p className="text-sm text-ink-2 mt-3 max-w-[42em]">最初の問いはこれです。<span className="font-semibold text-ink">「15秒で、初めてのお客様に御社を“伝わるように”説明できますか」</span>。多くの会社が、ここで止まります。伝えているのに、伝わっていない。キックオフの3時間は、その理由を御社の言葉で解きほぐし、8週間で何をどう答えればよいかが分かった状態をつくる時間です。AIが出す毎日の問いは、この3時間を前提に設計されています。</p>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-4">
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

        <div className="mt-6">
          {!applied && d.expires_at && new Date(d.expires_at) < new Date() ? (
            <p className="text-sm">このページの閲覧期限（<span className="num">{fmtMeeting(d.expires_at)}</span>）が過ぎたため、ここからのお申し込みは締め切りました。お申し込みを希望される場合は「ベレネッツに質問を残す」からご連絡ください。</p>
          ) : !applied ? (
            <>
              <div className="rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-6 sm:px-8 py-7 text-center">
                <p className="text-sm text-ink-2 max-w-[36em] mx-auto">診断結果を読んで「進めたい」と思われたら、下のボタンを押してください。受付メールが届き、2営業日以内にベレネッツから申込書・契約書と請求書をメールでお送りします。</p>
                <form action={preview ? undefined : applyProgram} className="mt-5">
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
          ) : d.chosen_date ? (
            <p className="text-sm">キックオフは <span className="num font-semibold">{fmtMeeting(d.chosen_date)}</span> で承りました。会議URLは決まりしだい、画面左の「次の面談」に表示します。</p>
          ) : dates.length > 0 ? (
            <>
              <p className="text-sm">入金を確認しました。キックオフ（3時間・オンライン）の日を選んでください。</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {dates.map((iso) => (
                  <form key={iso} action={preview ? undefined : chooseKickoff}>
                    <input type="hidden" name="date" value={iso} />
                    <button className="btn-primary num" type="submit" disabled={preview}>{fmtMeeting(iso)}</button>
                  </form>
                ))}
              </div>
              <p className="text-[12px] text-ink-3 mt-3">どれも合わない場合は「ベレネッツに質問を残す」からご希望日をお知らせください。</p>
            </>
          ) : (
            <p className="text-sm">入金を確認しました。キックオフの候補日は、ベレネッツからご連絡します。</p>
          )}
        </div>
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
      </>)}
      {company.status !== "diagnosed" && (
        <p className="mt-16 border-t hairline pt-6 text-sm text-ink-2 max-w-[40em] print:hidden">
          これは契約前の初回ヒアリングでの診断結果です。ここで見つかった芽とブレーキは、8週間のステップの出発点になります。最後の面談で、「御社を一言で言うと？」にもう一度答えていただきます。
        </p>
      )}
    </article>
  );
}
