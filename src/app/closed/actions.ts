"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOperators } from "@/server/notify";

/** 解約した会社のお客様が、ベレネッツに閲覧の再開を依頼する（アラートとメール。同じ依頼が未対応なら重ねない） */
export async function requestReaccess(formData: FormData) {
  const { user, profile } = await requireUser();
  if (profile.role === "operator" || !profile.company_id) redirect("/");
  const admin = createAdminClient();
  const { data: c } = await admin.from("companies").select("id, name, status, reaccess_until").eq("id", profile.company_id).maybeSingle();
  if (!c || c.status !== "cancelled") redirect("/");
  if (c.reaccess_until && new Date(c.reaccess_until) > new Date()) redirect("/");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const { data: dup } = await admin.from("alerts").select("id").eq("company_id", c.id).is("resolved_at", null).contains("payload", { type: "reaccess_requested" }).limit(1).maybeSingle();
  if (!dup) {
    await admin.from("alerts").insert({ company_id: c.id, kind: "escalation", payload: { type: "reaccess_requested", by: user.id, note } });
    await notifyOperators({
      subject: `${c.name}：解約後の閲覧の再開を依頼されました`,
      lines: [`${c.name} の ${profile.display_name ?? "担当者"} さんが、提供価値シートの閲覧の再開を依頼しました。`, note ? `ひとこと：${note}` : "", "確認のうえ、管理画面の「解約後のデータへの再アクセス」で期限を決めて閲覧を再開してください。"].filter(Boolean),
      path: `/admin/${c.id}`,
    });
  }
  redirect("/closed?sent=1");
}
