"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOperators } from "@/server/notify";
import { fmtMeeting } from "@/lib/meetings";

/** 顧客が「申し込む」を押す → 申込日時を記録し、ベレネッツに知らせる（契約書・請求書はアプリ外で送る） */
export async function applyProgram() {
  const { company, user } = await requireCustomer();
  const admin = createAdminClient();
  const { data: c } = await admin.from("companies").select("applied_at").eq("id", company.id).single();
  if (c?.applied_at) return;
  await admin.from("companies").update({ applied_at: new Date().toISOString() }).eq("id", company.id);
  await admin.from("alerts").insert({ company_id: company.id, kind: "escalation", payload: { type: "program_applied", by: user.id } });
  await notifyOperators({ subject: `${company.name} から申込がありました`, lines: [`${company.name} の担当者が、診断結果ページで「このプログラムに申し込む」を押しました。`, "申込書・契約書と請求書をメールでお送りください。契約・入金を確認したら、管理画面で「契約済」「入金済」を記録してください。"], path: `/admin/${company.id}` });
  revalidatePath("/diagnosis");
}

/** 顧客がキックオフ候補日を選ぶ（契約・入金の確認後のみ） → 面談として登録し、ベレネッツに知らせる */
export async function chooseKickoff(formData: FormData) {
  const { company, user } = await requireCustomer();
  const iso = String(formData.get("date") || "");
  const admin = createAdminClient();
  const { data: c } = await admin.from("companies").select("paid_at").eq("id", company.id).single();
  if (!c?.paid_at) return;
  const { data: d } = await admin.from("diagnosis_results").select("candidate_dates, chosen_date").eq("company_id", company.id).maybeSingle();
  const candidates = (d?.candidate_dates ?? []) as string[];
  if (!d || !candidates.includes(iso)) return;
  await admin.from("diagnosis_results").update({ chosen_date: iso, chosen_at: new Date().toISOString() }).eq("company_id", company.id);
  // 既存のキックオフ予定があれば差し替え
  await admin.from("company_meetings").delete().eq("company_id", company.id).eq("kind", "kickoff").is("held_at", null);
  await admin.from("company_meetings").insert({ company_id: company.id, kind: "kickoff", scheduled_at: iso, created_by: user.id });
  await admin.from("alerts").insert({ company_id: company.id, kind: "escalation", payload: { type: "kickoff_chosen", date: iso, by: user.id } });
  await notifyOperators({ subject: `${company.name} がキックオフ日を選びました（${fmtMeeting(iso)}）`, lines: [`${company.name} の担当者が、キックオフの日程を ${fmtMeeting(iso)} に決めました。`, "面談に会議URLを入れ、状態を「キックオフ前」に変えると STEP 0 が開きます。"], path: `/admin/${company.id}` });
  revalidatePath("/diagnosis");
  revalidatePath("/");
}

/** 顧客が診断結果ページを開いた記録。開くたびにベレネッツに通知する（10分以内の連続表示は1回と数える） */
export async function recordDiagnosisView() {
  const { company, user, profile } = await requireCustomer();
  const admin = createAdminClient();
  const { data: d } = await admin.from("diagnosis_results").select("first_viewed_at, last_viewed_at, view_count, published_at").eq("company_id", company.id).maybeSingle();
  if (!d || !d.published_at) return;
  const now = new Date();
  const last = d.last_viewed_at ? new Date(d.last_viewed_at) : null;
  if (last && now.getTime() - last.getTime() < 10 * 60 * 1000) {
    await admin.from("diagnosis_results").update({ last_viewed_at: now.toISOString() }).eq("company_id", company.id);
    return;
  }
  const count = (d.view_count ?? 0) + 1;
  await admin.from("diagnosis_results").update({ first_viewed_at: d.first_viewed_at ?? now.toISOString(), last_viewed_at: now.toISOString(), view_count: count }).eq("company_id", company.id);
  if (!d.first_viewed_at) await admin.from("alerts").insert({ company_id: company.id, kind: "escalation", payload: { type: "diagnosis_viewed", by: user.id } });
  const who = profile.display_name ?? "担当者";
  await notifyOperators({
    subject: count === 1 ? `${company.name} が適合診断の結果を開きました` : `${company.name} が適合診断の結果を再び開きました（${count}回目）`,
    lines: [
      count === 1 ? `${company.name} の ${who} さんが、適合診断の結果ページを初めて開きました。` : `${company.name} の ${who} さんが、適合診断の結果ページをもう一度開きました（${count}回目${d.first_viewed_at ? `、初回は ${fmtMeeting(d.first_viewed_at)}` : ""}）。`,
      count >= 3 ? "何度も読み返しています。迷っている点があるかもしれません。ひと声かける頃合いです。" : "申込ボタンが押されると、別途お知らせします。",
    ],
    path: `/admin/${company.id}`,
  });
}
