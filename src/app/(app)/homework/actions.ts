"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";

export async function answerHomework(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const id = String(formData.get("id"));
  const mode = String(formData.get("mode"));
  const answer = String(formData.get("answer") || "").trim();
  const askedWhom = String(formData.get("asked_whom") || "").trim();
  if (!askedWhom) return;
  await supabase
    .from("homeworks")
    .update({
      status: mode === "pass" ? "passed" : "answered",
      answer: mode === "pass" ? null : answer,
      pass_reason: mode === "pass" ? answer : null,
      asked_whom: askedWhom,
      answered_by: user.id,
      answered_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", company.id);
  revalidatePath("/homework");
}
