import { NextResponse } from "next/server";
import { cronAuthorized } from "@/server/cronAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { changeStatus } from "@/server/statusChange";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!cronAuthorized(auth)) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createAdminClient();
  const now = new Date();
  const iso = now.toISOString();
  // grace -> locked（ベレネッツの操作と同じ本体を通し、アラート整理などの後処理も行う）
  const { data: graceEnd } = await admin.from("companies").select("id").eq("status", "grace").lt("grace_until", iso);
  for (const c of graceEnd ?? []) await changeStatus(admin, c.id, "locked");
  // extended -> advisor
  const { data: extEnd } = await admin.from("companies").select("id").eq("status", "extended").lt("extension_until", iso);
  // 仕様（06）：延長期限を過ぎ、かつ確認セッション③が未実施のときだけ顧問扱いへ。③を終えた会社はベレネッツが次の状態を決める
  const extIds = (extEnd ?? []).map((c) => c.id);
  const { data: s3 } = extIds.length ? await admin.from("company_meetings").select("company_id").in("company_id", extIds).eq("kind", "session3").not("held_at", "is", null) : { data: [] };
  const s3Done = new Set((s3 ?? []).map((m) => m.company_id));
  for (const c of extEnd ?? []) if (!s3Done.has(c.id)) await changeStatus(admin, c.id, "advisor", { advisor_since: iso });
  // stale7 alerts
  const { data: companies } = await admin.from("companies").select("id, status").in("status", ["onboarding", "week1_2", "week3_5", "week6_8", "extended"]);
  for (const c of companies ?? []) {
    const { data: last } = await admin.from("activity_log").select("created_at").eq("company_id", c.id).not("event", "like", "%.error").not("event", "like", "intake.%").not("event", "like", "admin.%").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const lastAt = last ? new Date(last.created_at) : null;
    if (!lastAt || now.getTime() - lastAt.getTime() > 7 * 86400000) {
      const { data: existing } = await admin.from("alerts").select("id").eq("company_id", c.id).eq("kind", "stale7").is("resolved_at", null).maybeSingle();
      if (!existing) await admin.from("alerts").insert({ company_id: c.id, kind: "stale7", payload: { last_at: lastAt?.toISOString() ?? null } });
    } else {
      // 操作が再開していれば「7日操作なし」は済みにする
      await admin.from("alerts").update({ resolved_at: iso }).eq("company_id", c.id).eq("kind", "stale7").is("resolved_at", null);
    }
  }
  return NextResponse.json({ ok: true, at: iso });
}
