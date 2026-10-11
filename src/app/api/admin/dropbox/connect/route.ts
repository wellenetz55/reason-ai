import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSuperAdmin } from "@/lib/session";
import { dropboxConfigured, redirectUri } from "@/server/dropbox";

/** スーパー管理者が Dropbox と接続する（Dropbox の許可画面へ送る） */
export async function GET() {
  await requireSuperAdmin();
  if (!dropboxConfigured()) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/members?error=${encodeURIComponent("Vercel に DROPBOX_APP_KEY / DROPBOX_APP_SECRET が設定されていません")}#backup`);
  const state = crypto.randomUUID();
  (await cookies()).set("dbx_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/admin/dropbox", maxAge: 600 });
  const u = new URL("https://www.dropbox.com/oauth2/authorize");
  u.search = new URLSearchParams({ client_id: process.env.DROPBOX_APP_KEY!, response_type: "code", token_access_type: "offline", redirect_uri: redirectUri(), state }).toString();
  return NextResponse.redirect(u.toString());
}
