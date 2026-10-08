"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

/** 顧客がキックオフ候補日を選ぶ → 面談として登録し、ベレネッツに知らせる */
export async function chooseKickoff(formData: FormData) {
  const { company, user } = await requireCustomer();
  const iso = String(formData.get("date") || "");
  const admin = createAdminClient();
  const { data: d } = await admin.from("diagnosis_results").select("candidate_dates, chosen_date").eq("company_id", company.id).maybeSingle();
  const candidates = (d?.candidate_dates ?? []) as string[];
  if (!d || !candidates.includes(iso)) return;
  await admin.from("diagnosis_results").update({ chosen_date: iso, chosen_at: new Date().toISOString() }).eq("company_id", company.id);
  // 既存のキックオフ予定があれば差し替え
  await admin.from("company_meetings").delete().eq("company_id", company.id).eq("kind", "kickoff").is("held_at", null);
  await admin.from("company_meetings").insert({ company_id: company.id, kind: "kickoff", scheduled_at: iso, created_by: user.id });
  await admin.from("alerts").insert({ company_id: company.id, kind: "escalation", payload: { type: "kickoff_chosen", date: iso, by: user.id } });
  revalidatePath("/diagnosis");
  revalidatePath("/");
}
