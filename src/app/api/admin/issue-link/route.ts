import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 運用用: 登録済みユーザーのサインインリンクを発行する。
 * Bearer CRON_SECRET で保護（スケジューラと同じ秘密）。画面からは使わない。
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const admin = createAdminClient();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = list?.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
  if (!u) return NextResponse.json({ error: "not registered" }, { status: 404 });
  const { data: prof } = await admin.from("profiles").select("id").eq("id", u.id).maybeSingle();
  if (!prof) return NextResponse.json({ error: "no profile" }, { status: 404 });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.email! });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) return NextResponse.json({ error: error?.message ?? "failed" }, { status: 500 });
  return NextResponse.json({ url: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=magiclink` });
}
