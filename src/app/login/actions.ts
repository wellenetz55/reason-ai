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
    const code = (error as { code?: string }).code ?? "";
    const m = /after (\d+) seconds/.exec(error.message ?? "");
    // 未登録のメールアドレスでも、同じアドレスへの再送が早すぎる場合でも、同じ「送りました」表示にする。
    // （再送の間隔エラーは登録済みのアドレスにしか出ないため、別の文を出すと登録の有無が分かってしまう）
    if (code === "otp_disabled" || code === "over_email_send_rate_limit" || /signups not allowed|user not found|after \d+ seconds/i.test(error.message ?? "")) redirect(`/login?sent=1&t=${Date.now()}`);
    // アドレスに関係しない混雑（429）だけは、待つよう案内する
    const msg = error.status === 429
      ? `ただいま混み合っています。${m ? m[1] + "秒" : "1分ほど"}待ってから、もう一度お試しください。`
      : "送信できませんでした。しばらくしてからもう一度お試しください。";
    redirect(`/login?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/login?sent=1&t=${Date.now()}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
