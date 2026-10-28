import Link from "next/link";
import { APP_VERSION } from "@/lib/version";
export const instant = false;
import { sendMagicLink } from "./actions";
import { LOGIN_ERRORS, type LoginErrorCode } from "@/lib/loginErrors";
import { ReasonLogo, OperatedBy } from "@/components/Brand";

import { PendingBar } from "@/components/PendingBar";
import { LinkCountdown } from "@/components/LinkCountdown";

const GUIDE_URL = "https://www.wellenetz.co.jp/branding/reason-ai/";
const DIAGNOSIS_URL = "https://timerex.net/s/wellenetz/1999f366";
const BROCHURE_URL = "https://www.dropbox.com/scl/fi/er7qmhmmp3qvno8f9kovi/AI.pdf?rlkey=7388t2rpav6e3oozy9o7vktpr&dl=0";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const sent = sp?.sent === "1";
  // 文はURLから受け取らず、決まった記号から引く（偽の案内を出させないため）
  const code = typeof sp?.e === "string" ? sp.e : null;
  const error = code && Object.hasOwn(LOGIN_ERRORS, code) ? LOGIN_ERRORS[code as LoginErrorCode] : null;
  const t = typeof sp?.t === "string" ? Number(sp.t) : NaN;
  const sentAt = Number.isFinite(t) ? t : null;
  const signIn = sent ? (
    <div className="text-sm space-y-4">
      <p>メールを送りました。受信箱のリンクを開いてください。</p>
      {sentAt ? <LinkCountdown sentAt={sentAt} serverNow={Date.now()} /> : <p className="text-[13px] text-ink-2">リンクの有効期限は<strong className="text-ink">5分</strong>です。</p>}
      <div className="rounded-[var(--radius)] bg-paper-2 px-4 py-3 text-[13px] text-ink-2 leading-relaxed space-y-2">
        <p>届かないときは、まず<strong className="text-ink">迷惑メールフォルダ</strong>をご確認ください（送信元：noreply@reason-ai.wellenetz.co.jp）。</p>
        <p>数分待ってもサインイン用のリンクが来ない場合は、<Link href="/login" className="text-navy underline underline-offset-4">もう一度メールアドレスを入力して下さい</Link>。</p>
        <p>招待を受けたメールアドレスと違うアドレスを入れた場合も、メールは届きません。入力したアドレスをご確認ください。</p>
        <p>それでも届かない場合は、ベレネッツにご連絡ください。</p>
      </div>
    </div>
  ) : (
    <form action={sendMagicLink} className="space-y-5">
      <label className="block">
        <span className="text-xs text-ink-2">メールアドレス</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1 w-full border-b hairline py-2 text-base bg-transparent"
        />
      </label>
      {error && <p className="text-sm text-hypo">{error}</p>}
      <button className="btn-primary w-full" type="submit">サインイン用のリンクを送る</button>
      <p className="text-[12px] text-ink-3 leading-relaxed">登録したメールアドレスにリンクを送ります（有効期限5分）。ベレネッツから招待を受けた方のみサインインできます。</p>
    </form>
  );

  return (
    <main className="flex-1 flex flex-col px-6 py-10 md:py-14">
      <PendingBar stamp={Date.now()} />
      <div className="w-full max-w-[1040px] mx-auto flex-1 grid gap-12 md:grid-cols-[1.15fr_1fr] md:gap-16 items-start">
        {/* 左：サービスの案内と3つの入口 */}
        <section>
          <h1><ReasonLogo width={240} /></h1>
          <p className="serif text-[26px] md:text-[32px] leading-[1.25] mt-8 text-ink">
            お客様を引き寄せる<span className="text-warm">「脚本」</span>を8週間で。<br />
            そのあと、御社専用のAI<span className="text-warm">「脳」</span>が残る。
          </p>
          <p className="text-sm text-ink-2 leading-relaxed mt-4 max-w-[36em]">
            「安いから」ではなく「御社だから」と言われる言葉を、御社の中から言語化する8週間のプログラムです。AIが下書きし、御社が決め、ベレネッツのコンサルタントが確認します。完成した脚本を覚えた御社だけの「脳」が、そのあと集客・採用・営業の文章を書き続けます。御社側でのAI契約は不要です。
          </p>

          <ul className="mt-8 space-y-3 max-w-[36em]">
            <li>
              <a href={GUIDE_URL} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-[var(--radius)] border hairline bg-paper px-5 py-4 hover:border-navy hover:bg-navy-soft transition-colors">
                <span className="flex-shrink-0 w-10 h-10 rounded-full bg-navy-soft text-navy grid place-items-center group-hover:bg-paper">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z" /><path d="M20 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></svg>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-ink">サービス説明</span>
                  <span className="block text-[12px] text-ink-2 mt-0.5">8週間で何が起こり、何が残るか。進め方と費用の考え方</span>
                </span>
                <span className="text-navy" aria-hidden="true">→</span>
              </a>
            </li>
            <li>
              <a href={DIAGNOSIS_URL} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-5 py-4 hover:brightness-[0.98] transition">
                <span className="flex-shrink-0 w-10 h-10 rounded-full bg-warm text-on-accent grid place-items-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-ink">無料適合診断を申し込む<span className="ml-2 text-[11px] font-normal text-warm">45分・Zoom面談</span></span>
                  <span className="block text-[12px] text-ink-2 mt-0.5">御社に「選ばれる理由の芽」があるかを、ベレネッツ代表が直接お伺いします</span>
                </span>
                <span className="text-warm" aria-hidden="true">→</span>
              </a>
            </li>
            <li>
              <a href={BROCHURE_URL} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-[var(--radius)] border hairline bg-paper px-5 py-4 hover:border-navy hover:bg-navy-soft transition-colors">
                <span className="flex-shrink-0 w-10 h-10 rounded-full bg-navy-soft text-navy grid place-items-center group-hover:bg-paper">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" /></svg>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-ink">資料ダウンロード<span className="ml-2 text-[11px] font-normal text-ink-3">PDF・A4 2枚</span></span>
                  <span className="block text-[12px] text-ink-2 mt-0.5">8週間後に手に入るもの、向いている会社・向いていない会社</span>
                </span>
                <span className="text-navy" aria-hidden="true">→</span>
              </a>
            </li>
          </ul>
        </section>

        {/* 右：サインイン */}
        <section className="rounded-[var(--radius)] border hairline bg-paper-2 px-6 py-7 md:mt-[72px]">
          <p className="num text-[10px] font-semibold tracking-[0.14em] text-navy">ご契約中・診断結果をご覧の方</p>
          <h2 className="serif text-[20px] mt-1.5 mb-6">サインイン</h2>
          {signIn}
        </section>
      </div>
      <div className="w-full max-w-[1040px] mx-auto mt-14 flex flex-wrap items-end justify-between gap-4">
        <OperatedBy />
        <p className="num text-[11px] text-ink-3">{APP_VERSION}</p>
      </div>
    </main>
  );
}
