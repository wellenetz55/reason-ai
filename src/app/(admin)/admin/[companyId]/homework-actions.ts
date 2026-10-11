"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/session";

function back(companyId: string, q: string) {
  redirect(`/admin/${companyId}?${q}#homework`);
}

function readFields(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const why = String(formData.get("why") || "").trim();
  const hint = String(formData.get("ask_whom_hint") || "").trim();
  const due = String(formData.get("due_at") || "").trim(); // "2026-10-20"（JST の日付）
  const pr = Number(formData.get("priority") || 1);
  return {
    title,
    why: why || null,
    ask_whom_hint: hint || null,
    // 期限はその日の終わり（JST 23:59）
    due_at: due ? new Date(`${due}T23:59:00+09:00`).toISOString() : null,
    priority: [1, 2, 3].includes(pr) ? pr : 1,
  };
}

/** 宿題を出す。顧客側の左メニューと「宿題」画面にすぐ出る */
export async function createHomework(formData: FormData) {
  const { supabase } = await requireOperator();
  const companyId = String(formData.get("company_id"));
  const f = readFields(formData);
  if (!f.title) back(companyId, `hw_error=${encodeURIComponent("宿題の内容を入れてください")}`);
  const { error } = await supabase.from("homeworks").insert({ company_id: companyId, ...f });
  if (error) back(companyId, `hw_error=${encodeURIComponent("保存できませんでした：" + error.message)}`);
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/homework");
  revalidatePath("/", "layout");
  back(companyId, "hw_ok=created");
}

/** 未回答の宿題の内容・期限を直す */
export async function updateHomework(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("id"));
  const companyId = String(formData.get("company_id"));
  const f = readFields(formData);
  if (!f.title) back(companyId, `hw_error=${encodeURIComponent("宿題の内容は空にできません")}`);
  await supabase.from("homeworks").update(f).eq("id", id).eq("company_id", companyId).eq("status", "open");
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/homework");
  revalidatePath("/", "layout");
  back(companyId, "hw_ok=updated");
}

/** 未回答の宿題を取り下げる（回答済み・パス済みは記録として残すので取り下げない） */
export async function withdrawHomework(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("id"));
  const companyId = String(formData.get("company_id"));
  await supabase.from("homeworks").delete().eq("id", id).eq("company_id", companyId).eq("status", "open");
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/homework");
  revalidatePath("/", "layout");
  back(companyId, "hw_ok=withdrawn");
}

/** 回答済み・パスの宿題をもう一度出す（前の回答は消さずに残し、顧客は書き直せる） */
export async function reopenHomework(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("id"));
  const companyId = String(formData.get("company_id"));
  await supabase.from("homeworks").update({ status: "open", answered_at: null }).eq("id", id).eq("company_id", companyId).neq("status", "open");
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/homework");
  revalidatePath("/", "layout");
  back(companyId, "hw_ok=reopened");
}
