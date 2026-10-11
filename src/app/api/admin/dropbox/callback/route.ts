import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSuperAdmin } from "@/lib/session";
import { connectWithCode } from "@/server/dropbox";

/** Dropbox の許可画面から戻ってくる先。更新用トークンを保存する */
export async function GET(req: Request) {
  await requireSuperAdmin();
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("dbx_state")?.value;
  jar.delete({ name: "dbx_state", path: "/api/admin/dropbox" });
  const back = (q: string) => NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/members?${q}#backup`);
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent("Dropbox との接続を取りやめました")}`);
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back(`error=${encodeURIComponent("Dropbox との接続を確認できませんでした。もう一度お試しください")}`);
  try {
    await connectWithCode(code);
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Dropbox と接続できませんでした")}`);
  }
  return back("ok=dropbox");
}
