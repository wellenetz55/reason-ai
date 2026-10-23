"use server";
import { revalidatePath } from "next/cache";
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
  await admin.from("method_prompts").update({ is_active: false }).eq("key", key);
  await admin.from("method_prompts").insert({ key, version, body, is_active: true });
  revalidatePath("/admin/method");
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
