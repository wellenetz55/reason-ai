"use server";
import { MAX, cut } from "@/lib/limits";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";

export async function answerHomework(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const id = String(formData.get("id"));
  const mode = String(formData.get("mode"));
  const answer = cut(String(formData.get("answer") || "").trim(), MAX.answer);
  const askedWhom = cut(String(formData.get("asked_whom") || "").trim(), MAX.title);
  // 早く戻るときも画面を描き直す（送信中表示が残らないように）
  if (["diagnosed", "locked", "cancelled"].includes(company.status)) {
    revalidatePath("/homework");
    return;
  }
  if (!askedWhom || !answer) {
    const { redirect } = await import("next/navigation");
    redirect(`/homework?error=${encodeURIComponent(!askedWhom ? "「誰に聞いたか」を入れてください" : mode === "pass" ? "パスする理由を回答欄に書いてください" : "回答を書いてください")}`);
  }
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
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "homework.answer" });
  revalidatePath("/homework");
}
