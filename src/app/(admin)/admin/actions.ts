"use server";
import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/session";

export async function createCompany(formData: FormData) {
  const { supabase } = await requireOperator();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await supabase.from("companies").insert({ name, status: "diagnosed" });
  revalidatePath("/admin");
}

export async function setStatus(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("company_id"));
  const status = String(formData.get("status"));
  await supabase.from("companies").update({ status, status_changed_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/admin/${id}`);
  revalidatePath("/admin");
}
