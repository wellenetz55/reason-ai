"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

const KINDS = ["brochure", "sales_deck", "website", "recruit", "exhibition", "testimonial", "presentation", "other"] as const;
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"];

function kindOf(v: FormDataEntryValue | null) {
  const k = String(v ?? "other");
  return (KINDS as readonly string[]).includes(k) ? k : "other";
}

/** ファイル（PDF・画像・テキスト）を非公開バケットに保存し、company_documents に記録 */
export async function uploadDocument(formData: FormData) {
  const { company, user, supabase } = await requireCustomer();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_BYTES || !ALLOWED.includes(file.type)) return;
  const admin = createAdminClient();
  const path = `${company.id}/${randomUUID()}-${file.name.replace(/[^\w.\-ぁ-んァ-ン一-龠]/g, "_")}`;
  const { error } = await admin.storage.from("company-docs").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) return;
  await supabase.from("company_documents").insert({
    company_id: company.id,
    kind: kindOf(formData.get("kind")),
    title: String(formData.get("title") || file.name).trim() || file.name,
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
    uploaded_by: user.id,
  });
  revalidatePath("/step0");
}

/** URL を登録（Webサイト・採用ページ・レビューなど） */
export async function addUrl(formData: FormData) {
  const { company, user, supabase } = await requireCustomer();
  let url = String(formData.get("url") || "").trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try { new URL(url); } catch { return; }
  await supabase.from("company_documents").insert({
    company_id: company.id,
    kind: kindOf(formData.get("kind")),
    title: String(formData.get("title") || url).trim() || url,
    url,
    uploaded_by: user.id,
  });
  revalidatePath("/step0");
}

/** テキストを貼り付けて登録（議事録・営業トーク・メモなど） */
export async function addText(formData: FormData) {
  const { company, user, supabase } = await requireCustomer();
  const text = String(formData.get("text") || "").trim();
  if (!text) return;
  await supabase.from("company_documents").insert({
    company_id: company.id,
    kind: kindOf(formData.get("kind")),
    title: String(formData.get("title") || text.slice(0, 30)).trim() || "テキスト",
    text_content: text.slice(0, 200_000),
    uploaded_by: user.id,
  });
  revalidatePath("/step0");
}

/** 資料を取り下げる（ファイルも削除） */
export async function removeDocument(formData: FormData) {
  const { company, supabase } = await requireCustomer();
  const id = String(formData.get("id"));
  const { data: doc } = await supabase.from("company_documents").select("id, storage_path").eq("id", id).eq("company_id", company.id).maybeSingle();
  if (!doc) return;
  if (doc.storage_path) await createAdminClient().storage.from("company-docs").remove([doc.storage_path]);
  await supabase.from("company_documents").delete().eq("id", doc.id);
  revalidatePath("/step0");
}
