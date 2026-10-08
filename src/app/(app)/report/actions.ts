"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sendErrorReport(formData: FormData) {
  const { company, user, supabase } = await requireCustomer();
  const body = String(formData.get("body") || "").trim();
  if (!body) return;
  let screenshot_path: string | null = null;
  const file = formData.get("screenshot");
  if (file instanceof File && file.size > 0 && file.size <= 10 * 1024 * 1024 && file.type.startsWith("image/")) {
    const path = `${company.id}/error-reports/${randomUUID()}.${file.type.split("/")[1] ?? "png"}`;
    const { error } = await createAdminClient().storage.from("company-docs").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (!error) screenshot_path = path;
  }
  await supabase.from("error_reports").insert({
    company_id: company.id,
    user_id: user.id,
    page: String(formData.get("page") || "").slice(0, 500) || null,
    user_agent: String(formData.get("user_agent") || "").slice(0, 500) || null,
    body: body.slice(0, 5000),
    screenshot_path,
  });
  revalidatePath("/report");
}
