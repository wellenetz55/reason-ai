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
    // メール送信の上限（同じアドレスへの再送間隔・サービス全体の上限のどちらも）は、未登録のアドレスと同じ「送りました」にする。
    // サービス全体の上限に達しているあいだ、未登録は「送りました」・登録済みは「お待ちください」と分かれてしまうのを防ぐ。
    // 「送りました」の画面には、届かないときは数分おいて入れ直すよう案内がある。
    if (code === "otp_disabled" || code === "over_email_send_rate_limit" || /signups not allowed|user not found|after \d+ seconds|rate limit/i.test(error.message ?? "")) redirect(`/login?sent=1&t=${Date.now()}`);
    // アドレスに関係しない通信の混雑（429 のうち上記以外）だけ、待つよう案内する
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
