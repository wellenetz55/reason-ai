"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { notifyOperators } from "@/server/notify";

export async function askOperator(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const body = String(formData.get("body") || "").trim();
  if (!body) return;
  await supabase.from("questions_to_operator").insert({ company_id: company.id, body: body.slice(0, 5000), created_by: user.id });
  // 短時間に何通も送られたときは、メールは最初の3通まで（質問そのものは管理画面に全部残る）
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await supabase.from("questions_to_operator").select("id", { count: "exact", head: true }).eq("company_id", company.id).gte("created_at", since);
  if ((count ?? 0) <= 3) await notifyOperators({ subject: `${company.name} から質問があります`, lines: [`${company.name} の担当者から質問が届きました。`, body.length > 300 ? body.slice(0, 300) + "…" : body], path: `/admin/${company.id}` });
  revalidatePath("/ask");
}
