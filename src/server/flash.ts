import "server-only";
import { cookies } from "next/headers";

/**
 * 一度きりのエラー文を、URLではなく短命の cookie で次の画面に渡す。
 * URLに文を載せると、正規の画面の上に好きな文（偽の案内）を出せるリンクを作れてしまうため。
 * 画面側は URL の印（?error=1）があるときだけ読む。
 */
export async function setFlash(key: string, msg: string) {
  (await cookies()).set(`flash_${key}`, encodeURIComponent(msg.slice(0, 600)), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 });
}

export async function readFlash(key: string): Promise<string | null> {
  const v = (await cookies()).get(`flash_${key}`)?.value;
  if (!v) return null;
  try { return decodeURIComponent(v); } catch { return null; }
}
