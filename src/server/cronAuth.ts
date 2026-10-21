import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** 定期処理の合言葉（Authorization: Bearer CRON_SECRET）を、時間差で推測されない方法で照合する */
export function cronAuthorized(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authHeader) return false;
  // 長さの違いも漏らさないよう、ハッシュにそろえてから比べる
  const a = createHash("sha256").update(authHeader).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}
