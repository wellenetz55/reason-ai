"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { notifyOperators } from "@/server/notify";

export async function askOperator(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const body = String(formData.get("body") || "").trim();
  if (!body) return;
  await supabase.from("questions_to_operator").insert({ company_id: company.id, body, created_by: user.id });
  await notifyOperators({ subject: `${company.name} から質問があります`, lines: [`${company.name} の担当者から質問が届きました。`, body.length > 300 ? body.slice(0, 300) + "…" : body], path: `/admin/${company.id}` });
  revalidatePath("/ask");
}
