"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

/** プロンプトを新版として保存し、有効化（旧版は残る） */
export async function savePrompt(formData: FormData) {
  await requireSuperAdmin();
  const key = String(formData.get("key") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!key || !body) return;
  const admin = createAdminClient();
  const { data: last } = await admin.from("method_prompts").select("version").eq("key", key).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version ?? 0) + 1;
  // 先に新版を入れてから旧版を外す（入れるのに失敗しても、いま有効な版が残るように）
  const { data: ins, error } = await admin.from("method_prompts").insert({ key, version, body, is_active: false }).select("id").single();
  if (error || !ins) redirect("/admin/method?error=" + encodeURIComponent(`保存できませんでした：${error?.message ?? "不明なエラー"}`));
  await admin.from("method_prompts").update({ is_active: true }).eq("id", ins.id);
  await admin.from("method_prompts").update({ is_active: false }).eq("key", key).neq("id", ins.id);
  revalidatePath("/admin/method");
  redirect("/admin/method?notice=" + encodeURIComponent(`${key} を v${version} として保存し、有効にしました`));
}

export async function saveFixedText(formData: FormData) {
  await requireSuperAdmin();
  const key = String(formData.get("key") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!key) return;
  const admin = createAdminClient();
  // 空の保存で消えないように、消すのは「消す」ボタン（delete=1）のときだけ
  if (formData.get("delete") === "1") await admin.from("method_fixed_texts").delete().eq("key", key);
  else if (!body) return;
  else await admin.from("method_fixed_texts").upsert({ key, body, updated_at: new Date().toISOString() });
  revalidatePath("/admin/method");
}
