import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

/** operator 専用: バケット内ファイルを署名URLで開く */
export async function GET(req: Request) {
  await requireOperator();
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path || path.includes("..")) return NextResponse.json({ error: "bad path" }, { status: 400 });
  const { data } = await createAdminClient().storage.from("company-docs").createSignedUrl(path, 300);
  if (!data?.signedUrl) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
