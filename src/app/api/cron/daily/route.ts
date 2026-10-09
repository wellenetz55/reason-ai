import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createAdminClient();
  const now = new Date();
  const iso = now.toISOString();
  // grace -> locked
  await admin.from("companies").update({ status: "locked", status_changed_at: iso }).eq("status", "grace").lt("grace_until", iso);
  // extended -> advisor
  await admin.from("companies").update({ status: "advisor", status_changed_at: iso, advisor_since: iso }).eq("status", "extended").lt("extension_until", iso);
  // stale7 alerts
  const { data: companies } = await admin.from("companies").select("id, status").in("status", ["onboarding", "week1_2", "week3_5", "week6_8", "extended"]);
  for (const c of companies ?? []) {
    const { data: last } = await admin.from("activity_log").select("created_at").eq("company_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const lastAt = last ? new Date(last.created_at) : null;
    if (!lastAt || now.getTime() - lastAt.getTime() > 7 * 86400000) {
      const { data: existing } = await admin.from("alerts").select("id").eq("company_id", c.id).eq("kind", "stale7").is("resolved_at", null).maybeSingle();
      if (!existing) await admin.from("alerts").insert({ company_id: c.id, kind: "stale7", payload: { last_at: lastAt?.toISOString() ?? null } });
    }
  }
  return NextResponse.json({ ok: true, at: iso });
}
