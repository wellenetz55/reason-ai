"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const fail = (msg: string): never => redirect(`/step0?error=${encodeURIComponent(msg)}`);
import { randomUUID } from "node:crypto";
import { requireCustomer, requireWritableCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "@/lib/limits";
import { draftProfile } from "@/server/profile";
import { aiGuard } from "@/server/aiGuard";

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
  const { company, user, supabase } = await requireWritableCustomer();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) fail("ファイルを選んでください。");
  const f = file as File;
  if (f.size > MAX_BYTES) fail("ファイルが大きすぎます（25MBまで）。");
  if (!ALLOWED.includes(f.type)) fail("このファイルの形式は登録できません（PDF・画像・テキスト）。");
  const u = await usage(supabase, company.id);
  if (u.files >= LIMITS.files || u.bytes + f.size > LIMITS.totalBytes) fail("登録できるファイルの数か容量の上限に達しています。不要な資料を取り下げてください。");
  const admin = createAdminClient();
  const path = `${company.id}/${randomUUID()}-${f.name.replace(/[^\w.\-ぁ-んァ-ン一-龠]/g, "_")}`;
  const { error } = await admin.storage.from("company-docs").upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: false });
  if (error) fail("保存できませんでした。しばらくしてからもう一度お試しください。");
  await supabase.from("company_documents").insert({
    company_id: company.id,
    kind: kindOf(formData.get("kind")),
    title: String(formData.get("title") || f.name).trim() || f.name,
    storage_path: path,
    mime_type: f.type,
    size_bytes: f.size,
    uploaded_by: user.id,
  });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "doc.upload" });
  revalidatePath("/step0");
}

/** URL を登録（Webサイト・採用ページ・レビューなど） */
export async function addUrl(formData: FormData) {
  const { company, user, supabase } = await requireWritableCustomer();
  let url = String(formData.get("url") || "").trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let ok = true;
  try { new URL(url); } catch { ok = false; }
  if (!ok) fail("URLの形式が正しくありません。");
  if ((await usage(supabase, company.id)).urls >= LIMITS.urls) fail("登録できるURLの数の上限に達しています。");
  await supabase.from("company_documents").insert({
    company_id: company.id,
    kind: kindOf(formData.get("kind")),
    title: String(formData.get("title") || url).trim() || url,
    url,
    uploaded_by: user.id,
  });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "doc.url" });
  revalidatePath("/step0");
}

/** テキストを貼り付けて登録（議事録・営業トーク・メモなど） */
export async function addText(formData: FormData) {
  const { company, user, supabase } = await requireWritableCustomer();
  const text = String(formData.get("text") || "").trim();
  if (!text) return;
  if ((await usage(supabase, company.id)).texts >= LIMITS.texts) fail("登録できるテキストの数の上限に達しています。");
  await supabase.from("company_documents").insert({
    company_id: company.id,
    kind: kindOf(formData.get("kind")),
    title: String(formData.get("title") || text.slice(0, 30)).trim() || "テキスト",
    text_content: text.slice(0, 200_000),
    uploaded_by: user.id,
  });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "doc.text" });
  revalidatePath("/step0");
}

/** 資料を取り下げる（ファイルも削除） */
export async function removeDocument(formData: FormData) {
  const { company, supabase } = await requireWritableCustomer();
  const id = String(formData.get("id"));
  const { data: doc } = await supabase.from("company_documents").select("id, storage_path").eq("id", id).eq("company_id", company.id).maybeSingle();
  if (!doc) return;
  if (doc.storage_path?.startsWith(`${company.id}/`)) await createAdminClient().storage.from("company-docs").remove([doc.storage_path]);
  await supabase.from("company_documents").delete().eq("id", doc.id);
  revalidatePath("/step0");
}

// ---------- 御社の説明（profile_items） ----------

/** 資料から AI が下書きを作る。承認済み・直した・保留の項目は上書きしない */
export async function requestProfileDraft() {
  const { supabase, company, user } = await requireWritableCustomer();
  const res = await aiGuard(supabase, company.id, user.id, "profile.draft", () => draftProfile(company.id, company.name));
  if (!res) { revalidatePath("/step0"); return; }
  const { items, skipped, errors } = res;
  const { data: existing } = await supabase.from("profile_items").select("key, status").eq("company_id", company.id);
  const locked = new Set((existing ?? []).filter((e) => ["approved", "fixed", "held"].includes(e.status)).map((e) => e.key));
  const rows = items.filter((i) => !locked.has(i.key)).map((i) => ({
    company_id: company.id, key: i.key, draft: i.draft || null, tag: i.tag || "hypothesis", source: i.source || null,
    status: i.draft ? "draft" : "empty", updated_at: new Date().toISOString(),
  }));
  if (rows.length) await supabase.from("profile_items").upsert(rows, { onConflict: "company_id,key" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "profile.draft", payload: { n: rows.length, skipped, errors } });
  revalidatePath("/step0");
}

/** 項目ごとの 直す／承認／保留、B の回答 */
export async function reviewProfileItem(formData: FormData) {
  const { supabase, company } = await requireWritableCustomer();
  const key = String(formData.get("key"));
  const action = String(formData.get("action")); // approve | fix | hold | answer | reopen
  const after = String(formData.get("after") || "").trim();
  const { data: cur } = await supabase.from("profile_items").select("*").eq("company_id", company.id).eq("key", key).maybeSingle();
  const patch: Record<string, unknown> = { company_id: company.id, key, updated_at: new Date().toISOString() };
  if (action === "approve") { patch.value = cur?.draft ?? null; patch.status = "approved"; }
  else if (action === "fix" || action === "answer") { if (!after) return; patch.value = after; patch.status = "fixed"; if (action === "answer") patch.tag = "fact"; }
  else if (action === "hold") { patch.status = "held"; }
  // 戻す：自分で書いた（または承認した）文は残す
  // 戻す：確定・承認した文は消さずに下書きへ戻す（状態は「下書き」。もう一度承認・修正できる）
  else if (action === "reopen") { const keep = cur?.value ?? cur?.draft ?? null; patch.draft = keep; patch.value = null; patch.status = keep ? "draft" : "empty"; }
  await supabase.from("profile_items").upsert({ ...(cur ?? {}), ...patch }, { onConflict: "company_id,key" });
  await supabase.from("activity_log").insert({ company_id: company.id, event: "profile.review" });
  revalidatePath("/step0");
}
