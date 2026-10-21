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
    // 未登録のメールアドレスでも「送りました」と同じ表示にする（登録の有無を外から確かめられないように）
    if (code === "otp_disabled" || /signups not allowed|user not found/i.test(error.message ?? "")) redirect(`/login?sent=1&t=${Date.now()}`);
    const msg = code === "over_email_send_rate_limit" || error.status === 429
      ? `送信の間隔が短すぎます。${m ? m[1] + "秒" : "1分ほど"}待ってから、もう一度お試しください。`
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
