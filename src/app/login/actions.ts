"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) redirect("/login?error=メールアドレスを入力してください");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`, shouldCreateUser: false },
  });
  if (error) {
    // 送信の結果は、アドレスが登録済みかどうかに関係なく同じ「送りました」画面にする。
    // 登録済みのときだけ起きるエラー（送信失敗・利用停止・再送間隔・送信上限など）で表示が変わると、登録の有無が分かってしまうため。
    // 本当の理由はサーバのログに残す。メールアドレスは残さない（Supabase のエラー文にアドレスが入ることがあるため、文は記録しない）。
    // 例外は、アドレスに関係しない通信の混雑（送信上限以外の 429）だけ。
    const code = (error as { code?: string }).code ?? "";
    console.error("login.sendMagicLink", { status: error.status, code: code || "(none)", name: error.name });
    const emailLimit = code === "over_email_send_rate_limit" || /rate limit|after \d+ seconds/i.test(error.message ?? "");
    if (error.status === 429 && !emailLimit) redirect(`/login?error=${encodeURIComponent("ただいま混み合っています。1分ほど待ってから、もう一度お試しください。")}`);
    redirect(`/login?sent=1&t=${Date.now()}`);
  }
  redirect(`/login?sent=1&t=${Date.now()}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
