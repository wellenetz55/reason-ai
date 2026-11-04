import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_MAX = 5;  // 同じアドレスへは1時間に5回まで
const IP_MAX = 20;    // 同じ接続元からは1時間に20回まで（事務所で1つのIPを共有するため、アドレスより緩く）

// ハッシュの鍵。専用の環境変数が無ければ service role の鍵を使う（どちらもサーバにしか無い）
const hash = (v: string) => createHmac("sha256", process.env.SIGNIN_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "reason-ai").update(v).digest("hex");

/** サインインリンクを送ってよいか。'ok' のときだけ送る。DBの不調でサインインを止めないよう、確かめられないときは 'ok' */
export async function signinAllowed(email: string): Promise<"ok" | "email" | "ip"> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
  const { data, error } = await createAdminClient().rpc("signin_throttle", { p_email: hash(email.toLowerCase()), p_ip: hash(ip), p_email_max: EMAIL_MAX, p_ip_max: IP_MAX });
  if (error) { console.error("signinThrottle", error.code); return "ok"; }
  return data === "email" || data === "ip" ? data : "ok";
}

/** Supabase の送信上限に達したことを、ベレネッツに1時間に1回だけ知らせてよいか */
export async function rateAlertAllowed(): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("signin_throttle", { p_email: "__rate_alert__", p_ip: "-", p_email_max: 1, p_ip_max: 100000 });
  return !error && data === "ok";
}

/** 1日より古い記録を消す（日次の定期処理から） */
export async function pruneSigninAttempts() {
  await createAdminClient().from("signin_attempts").delete().lt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
}
