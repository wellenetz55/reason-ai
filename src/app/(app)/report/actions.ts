"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOperators } from "@/server/notify";

export async function sendErrorReport(formData: FormData) {
  const { company, user, supabase } = await requireCustomer();
  const body = String(formData.get("body") || "").trim();
  if (!body) return;
  let screenshot_path: string | null = null;
  const file = formData.get("screenshot");
  // 画像は写真の形式だけ（SVG などは中にスクリプトを持てるため受け付けない）。1日の枚数にも上限を設ける（保管場所を埋められないように）
  const IMG_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
  const ext = file instanceof File ? IMG_EXT[file.type] : undefined;
  const { count: today } = await supabase.from("error_reports").select("id", { count: "exact", head: true }).eq("company_id", company.id).not("screenshot_path", "is", null).gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  if (file instanceof File && ext && file.size > 0 && file.size <= 10 * 1024 * 1024 && (today ?? 0) < 20) {
    const path = `${company.id}/error-reports/${randomUUID()}.${ext}`;
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
  // 短時間に何通も送られたときは、メールは最初の3通まで（レポートそのものは管理画面に全部残る）
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await supabase.from("error_reports").select("id", { count: "exact", head: true }).eq("company_id", company.id).gte("created_at", since);
  if ((count ?? 0) <= 3) await notifyOperators({ subject: `${company.name} からエラーレポート`, lines: [`${company.name} の担当者からエラーレポートが届きました。`, body.length > 300 ? body.slice(0, 300) + "…" : body, screenshot_path ? "スクリーンショットあり" : ""].filter(Boolean), path: `/admin/${company.id}` });
  revalidatePath("/report");
}
