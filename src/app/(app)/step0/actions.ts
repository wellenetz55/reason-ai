"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "@/lib/limits";
import { draftProfile } from "@/server/profile";

const KINDS = ["brochure", "sales_deck", "website", "recruit", "exhibition", "testimonial", "presentation", "other"] as const;
const MAX_BYTES = 25 * 1024 * 1024;

async function usage(supabase: Awaited<ReturnType<typeof requireCustomer>>["supabase"], companyId: string) {
  const { data } = await supabase.from("company_documents").select("storage_path, url, text_content, size_bytes").eq("company_id", companyId);
  const docs = data ?? [];
  return {
    files: docs.filter((d) => d.storage_path).length,
    bytes: docs.reduce((a, d) => a + (d.size_bytes ?? 0), 0),
    urls: docs.filter((d) => d.url).length,
    texts: docs.filter((d) => !d.storage_path && !d.url).length,
  };
}
export type Usage = Awaited<ReturnType<typeof usage>>;
export async function getUsage() {
  const { supabase, company } = await requireCustomer();
  return usage(supabase, company.id);
}
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
  const u = await usage(supabase, company.id);
  if (u.files >= LIMITS.files || u.bytes + file.size > LIMITS.totalBytes) return;
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
  if ((await usage(supabase, company.id)).urls >= LIMITS.urls) return;
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
  if ((await usage(supabase, company.id)).texts >= LIMITS.texts) return;
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

// ---------- 御社の説明（profile_items） ----------

/** 資料から AI が下書きを作る。承認済み・直した・保留の項目は上書きしない */
export async function requestProfileDraft() {
  const { supabase, company, user } = await requireCustomer();
  let items: Awaited<ReturnType<typeof draftProfile>>["items"] = [];
  try {
    ({ items } = await draftProfile(company.id, company.name));
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "profile.draft.error", payload: { msg: msg.slice(0, 500) } });
    revalidatePath("/step0");
    return;
  }
  const { data: existing } = await supabase.from("profile_items").select("key, status").eq("company_id", company.id);
  const locked = new Set((existing ?? []).filter((e) => ["approved", "fixed", "held"].includes(e.status)).map((e) => e.key));
  const rows = items.filter((i) => !locked.has(i.key)).map((i) => ({
    company_id: company.id, key: i.key, draft: i.draft || null, tag: i.tag || "hypothesis", source: i.source || null,
    status: i.draft ? "draft" : "empty", updated_at: new Date().toISOString(),
  }));
  if (rows.length) await supabase.from("profile_items").upsert(rows, { onConflict: "company_id,key" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "profile.draft", payload: { n: rows.length } });
  revalidatePath("/step0");
}

/** 項目ごとの 直す／承認／保留、B の回答 */
export async function reviewProfileItem(formData: FormData) {
  const { supabase, company } = await requireCustomer();
  const key = String(formData.get("key"));
  const action = String(formData.get("action")); // approve | fix | hold | answer | reopen
  const after = String(formData.get("after") || "").trim();
  const { data: cur } = await supabase.from("profile_items").select("*").eq("company_id", company.id).eq("key", key).maybeSingle();
  const patch: Record<string, unknown> = { company_id: company.id, key, updated_at: new Date().toISOString() };
  if (action === "approve") { patch.value = cur?.draft ?? null; patch.status = "approved"; }
  else if (action === "fix" || action === "answer") { if (!after) return; patch.value = after; patch.status = "fixed"; if (action === "answer") patch.tag = "fact"; }
  else if (action === "hold") { patch.status = "held"; }
  else if (action === "reopen") { patch.status = cur?.draft ? "draft" : "empty"; patch.value = null; }
  await supabase.from("profile_items").upsert({ ...(cur ?? {}), ...patch }, { onConflict: "company_id,key" });
  revalidatePath("/step0");
}
