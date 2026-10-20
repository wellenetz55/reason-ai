"use server";
import { randomUUID } from "node:crypto";
import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

/** 面談メモ・資料（適合診断の記録に添える複数ファイル）。ページを読み直さないので、入力中の記録は消えない */

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_TEXT = 200_000;
const OK_EXT = /\.(txt|md|vtt|srt|csv|tsv|pdf|docx|png|jpe?g|heic|webp)$/i;

export type IntakeFile = { id: string; name: string; storage_path: string; size_bytes: number | null; chars: number; created_at: string };

const missing = (m: string) => /diagnosis_intake_files/.test(m) ? "面談メモの保存先がまだありません（SQL 0023 が未実行の可能性があります）" : /meeting_files/.test(m) ? "面談の記録の保存先がまだありません（SQL 0026 が未実行の可能性があります）" : m;
/** 適合診断の記録（meetingId 無し）と、面談の記録（meetingId 有り）で、表と置き場所を分ける */
const where = (meetingId?: string) => meetingId ? { table: "meeting_files", prefix: "_meeting" } : { table: "diagnosis_intake_files", prefix: "_intake" };

/** ① 送り先を発行（ブラウザから保管場所へ直接送る。大きいファイルでも通る） */
export async function prepareIntakeFile(meta: { companyId: string; name: string; size: number; meetingId?: string }): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  await requireOperator();
  if (!OK_EXT.test(meta.name)) return { ok: false, error: `${meta.name}：この形式は登録できません（テキスト・PDF・Word(.docx)・画像）` };
  if (meta.size > MAX_BYTES) return { ok: false, error: `${meta.name}：大きすぎます（25MBまで）` };
  const { data: c } = await createAdminClient().from("companies").select("id").eq("id", meta.companyId).maybeSingle();
  if (!c) return { ok: false, error: "会社が見つかりません" };
  const ext = (meta.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "bin").toLowerCase();
  const path = `${where(meta.meetingId).prefix}/${meta.companyId}/${randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from("company-docs").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: `${meta.name}：送り先を用意できませんでした` };
  return { ok: true, path, token: data.token };
}

/** ② 送り終わったファイルを記録し、文字を取り出す */
export async function finishIntakeFile(meta: { companyId: string; path: string; name: string; type: string; meetingId?: string }): Promise<{ ok: true; file: IntakeFile; note?: string } | { ok: false; error: string }> {
  const { user } = await requireOperator();
  const admin = createAdminClient();
  const w = where(meta.meetingId);
  const re = new RegExp(`^${w.prefix}/${meta.companyId}/[0-9a-f-]{36}\\.[a-z0-9]+$`);
  if (!re.test(meta.path)) return { ok: false, error: "不正なファイルです" };
  const { data: blob, error: de } = await admin.storage.from("company-docs").download(meta.path);
  if (de || !blob) return { ok: false, error: `${meta.name}：届いていませんでした。もう一度お試しください` };
  if (blob.size > MAX_BYTES) { await admin.storage.from("company-docs").remove([meta.path]); return { ok: false, error: `${meta.name}：大きすぎます（25MBまで）` }; }
  const { fileToText } = await import("@/server/extract");
  const ex = await fileToText(Buffer.from(await blob.arrayBuffer()), meta.name, meta.type || blob.type);
  const text = ex.text ? ex.text.slice(0, MAX_TEXT) : null;
  const { data, error } = await admin.from(w.table).insert({
    company_id: meta.companyId, ...(meta.meetingId ? { meeting_id: meta.meetingId } : {}), name: meta.name.slice(0, 200), storage_path: meta.path, mime_type: meta.type || blob.type || null, size_bytes: blob.size, text_content: text, created_by: user.id,
  }).select("id, name, storage_path, size_bytes, created_at").single();
  if (error || !data) { await admin.storage.from("company-docs").remove([meta.path]); return { ok: false, error: `${meta.name}：記録できませんでした（${missing(error?.message ?? "")}）` }; }
  return { ok: true, file: { ...data, chars: text?.length ?? 0 }, note: ex.error ? `${meta.name}：${ex.error}（ファイルは保管しました）` : undefined };
}

/** 面談メモを外す（記録とファイルを消す。ベレネッツ側のメモなので消してよい） */
export async function removeIntakeFile(meta: { companyId: string; id: string; meetingId?: string }): Promise<{ ok: boolean; error?: string }> {
  await requireOperator();
  const admin = createAdminClient();
  const t = where(meta.meetingId).table;
  const { data } = await admin.from(t).select("storage_path").eq("id", meta.id).eq("company_id", meta.companyId).maybeSingle();
  if (!data) return { ok: false, error: "見つかりません" };
  const { error } = await admin.from(t).delete().eq("id", meta.id);
  if (error) return { ok: false, error: error.message };
  await admin.storage.from("company-docs").remove([data.storage_path]);
  return { ok: true };
}
