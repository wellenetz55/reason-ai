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
