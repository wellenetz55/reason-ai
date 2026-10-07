export const instant = false;
import { sendMagicLink } from "./actions";
import { ReasonLogo, OperatedBy } from "@/components/Brand";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const sent = sp?.sent === "1";
  const error = typeof sp?.error === "string" ? sp.error : null;
  return (
    <main className="flex-1 grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-3"><ReasonLogo width={240} /></h1>
        <p className="text-ink-2 text-sm mb-10">登録したメールアドレスにサインイン用のリンクを送ります。</p>
        {sent ? (
          <p className="text-sm">メールを送りました。受信箱のリンクを開いてください。</p>
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
      </div>
    </main>
  );
}
