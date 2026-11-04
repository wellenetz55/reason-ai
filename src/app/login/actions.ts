"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginErrorUrl } from "@/lib/loginErrors";
import { signinAllowed, rateAlertAllowed } from "@/server/signinThrottle";
import { notifyOperators } from "@/server/notify";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) redirect(loginErrorUrl("noemail"));
  // 送信回数の上限（SQL 0051）。上限のときも、登録の有無が分からないよう同じ「送りました」画面にする
  const allowed = await signinAllowed(email);
  if (allowed !== "ok") {
    console.warn("login.sendMagicLink throttled", { reason: allowed });
    redirect(`/login?sent=1&t=${Date.now()}`);
  }
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
    // Supabase のメール送信枠が尽きた：本物のサインイン・招待も届かなくなるので、ベレネッツに知らせる（1時間に1回まで）
    if (emailLimit && (await rateAlertAllowed())) {
      await notifyOperators({ subject: "サインインメールの送信上限に達しました", lines: ["Supabase のメール送信上限に達したため、サインインリンクや招待メールが届かない状態です。", "1時間ほどで回復します。続く場合は、Supabase の Auth のメール設定（送信上限・SMTP）を確認してください。"], path: "/admin", onlySuper: true }).catch(() => {});
    }
    if (error.status === 429 && !emailLimit) redirect(loginErrorUrl("busy"));
    redirect(`/login?sent=1&t=${Date.now()}`);
  }
  redirect(`/login?sent=1&t=${Date.now()}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
