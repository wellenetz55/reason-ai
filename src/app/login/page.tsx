import Link from "next/link";
import { APP_VERSION } from "@/lib/version";
export const instant = false;
import { sendMagicLink } from "./actions";
import { ReasonLogo, OperatedBy } from "@/components/Brand";

import { PendingBar } from "@/components/PendingBar";
import { LinkCountdown } from "@/components/LinkCountdown";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const sent = sp?.sent === "1";
  const error = typeof sp?.error === "string" ? sp.error : null;
  const t = typeof sp?.t === "string" ? Number(sp.t) : NaN;
  const sentAt = Number.isFinite(t) ? t : null;
  return (
    <main className="flex-1 grid place-items-center px-6">
      <PendingBar stamp={Date.now()} />
      <div className="w-full max-w-sm">
        <h1 className="mb-3"><ReasonLogo width={240} /></h1>
        <p className="text-ink-2 text-sm mb-10">登録したメールアドレスにサインイン用のリンクを送ります（有効期限5分）。ベレネッツから招待を受けた方のみサインインできます。</p>
        {sent ? (
          <div className="text-sm space-y-4">
            <p>メールを送りました。受信箱のリンクを開いてください。</p>
            {sentAt ? <LinkCountdown sentAt={sentAt} /> : <p className="text-[13px] text-ink-2">リンクの有効期限は<strong className="text-ink">5分</strong>です。</p>}
            <div className="rounded-[var(--radius)] bg-paper-2 px-4 py-3 text-[13px] text-ink-2 leading-relaxed space-y-2">
              <p>届かないときは、まず<strong className="text-ink">迷惑メールフォルダ</strong>をご確認ください（送信元：noreply@reason-ai.wellenetz.co.jp）。</p>
              <p>1〜2分待ってもサインイン用のリンクが来ない場合は、<Link href="/login" className="text-navy underline underline-offset-4">もう一度メールアドレスを入力して下さい</Link>。</p>
              <p>それでも届かない場合は、ベレネッツにご連絡ください。</p>
            </div>
          </div>
        ) : (
          <form action={sendMagicLink} className="space-y-6">
            <label className="block">
              <span className="text-xs text-ink-2">メールアドレス</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full border-b hairline py-2 text-base"
              />
            </label>
            {error && <p className="text-sm text-hypo">{error}</p>}
            <button className="btn-primary" type="submit">リンクを送る</button>
          </form>
        )}
        <OperatedBy className="mt-16" />
        <p className="num text-[11px] text-ink-3 mt-2">{APP_VERSION}</p>
      </div>
    </main>
  );
}
