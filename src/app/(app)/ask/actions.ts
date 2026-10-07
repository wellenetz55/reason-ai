"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";

export async function askOperator(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const body = String(formData.get("body") || "").trim();
  if (!body) return;
  await supabase.from("questions_to_operator").insert({ company_id: company.id, body, created_by: user.id });
  revalidatePath("/ask");
}
