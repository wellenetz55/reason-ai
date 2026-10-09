import { requireCustomer } from "@/lib/session";
import { BRAKE_LABEL, TAG_LABEL } from "@/lib/diagnosis";
import { fmtMeeting } from "@/lib/meetings";
import { chooseKickoff, applyProgram } from "./actions";
import { PrintButton } from "@/components/PrintButton";

type Seed = { feature: string; experience: string; tag: string };
type Brake = { kind: string; words: string };
type Fit = { condition: string; quote: string };

const WEEKS = [
  { w: "第0週", t: "キックオフ（3時間）", b: "会社資料を読み込み、最初の言葉を出す" },
  { w: "第1〜2週", t: "骨格をつくる", b: "提供価値を30行書き出し、絞る。確認セッション①" },
  { w: "第3〜5週", t: "肉付けする", b: "お客様のブレーキを外し、体験価値に磨く。中間チェック、確認セッション②" },
  { w: "第6〜8週", t: "仕上げる", b: "証拠をつけ、営業・価格・Webの言葉に展開。確認セッション③" },
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

      {d.one_liner_before && (
        <section className="mt-12">
          <p className="text-[12px] text-ink-3">面談で、御社をこう一言で表されました</p>
          <blockquote className="serif text-[24px] leading-snug mt-2 border-l-2 border-navy pl-5">「{d.one_liner_before}」</blockquote>
          <p className="text-sm text-ink-2 mt-3 max-w-[56ch]">8週間後、この一言がどう変わるかを見てください。最後の確認セッションで、同じ問いにもう一度お答えいただきます。</p>
        </section>
      )}

      {seeds.length > 0 && (
        <section className="mt-14">
          <h2 className="serif text-[20px]">面談で見えた「選ばれる理由」の芽</h2>
          <p className="text-sm text-ink-2 mt-1 max-w-[56ch]">お話しいただいた言葉を、提供価値の型に仮に置き換えたものです。まだ仮説です。8週間で事実にします。</p>
          <ol className="mt-5 space-y-4">
            {seeds.map((s, i) => (
              <li key={i} className={`tag-line ${tagCls[s.tag] ?? "tag-hypo"} pl-5 py-1`}>
                <p className="serif text-[17px] leading-snug">御社は、{s.feature}</p>
                {s.experience && <p className="text-ink-2 mt-1">だから、お客様は {s.experience}</p>}
                <p className="text-[11px] text-ink-3 mt-1">{TAG_LABEL[s.tag] ?? "仮説"}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {brakes.length > 0 && (
        <section className="mt-14">
          <h2 className="serif text-[20px]">まだ言葉になっていないブレーキ</h2>
          <p className="text-sm text-ink-2 mt-1 max-w-[56ch]">お客様が御社を選ぶ直前に、おそらくこう迷っています。これに先回りの答えを用意するのが3〜5週目の仕事です。</p>
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
        <h2 className="serif text-[20px]">{company.name}様の8週間</h2>
        <ol className="mt-5 space-y-3">
          {WEEKS.map((x) => (
            <li key={x.w} className="grid grid-cols-[90px_1fr] gap-4">
              <span className="num text-[12px] text-ink-3 pt-1">{x.w}</span>
              <div><p className="font-medium">{x.t}</p><p className="text-sm text-ink-2">{x.b}</p></div>
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
        <p className="text-[13px] text-ink-2 mt-6 max-w-[56ch] leading-relaxed">
          費用は8週間で70万円（前払い・税別）。確認セッション①までに「違う」と感じられた場合は半額を返金します。
        </p>
      </section>
    </article>
  );
}
