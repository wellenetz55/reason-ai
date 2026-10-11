"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Q_KEYS } from "@/server/intake";

const back = (companyId: string, q: string): never => redirect(`/admin/${companyId}/intake?${q}`);
const MAX_TRANSCRIPT = 400_000;

/** 対象・7問の答え・判定メモを保存。URLは資料として会社に登録する（お客様のSTEP 0に最初から入る） */
export async function saveIntake(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = String(formData.get("company_id"));
  const kind = String(formData.get("target_kind") || "company");
  const answers: Record<string, string> = {};
  for (const k of [...Q_KEYS, "extra", "attendees"]) answers[k] = String(formData.get(k) || "").trim();
  const heldOn = String(formData.get("held_on") || "").trim();
  const verdict = String(formData.get("verdict") || "").trim();
  const { data: cur } = await supabase.from("diagnosis_intakes").select("transcript, transcript_name").eq("company_id", companyId).maybeSingle();
  const { error } = await supabase.from("diagnosis_intakes").upsert({
    company_id: companyId,
    target_kind: ["company", "brand", "product"].includes(kind) ? kind : "company",
    target_name: String(formData.get("target_name") || "").trim() || null,
    target_note: String(formData.get("target_note") || "").trim() || null,
    answers,
    transcript: cur?.transcript ?? null,
    transcript_name: cur?.transcript_name ?? null,
    verdict: ["fit", "unfit", "hold"].includes(verdict) ? verdict : null,
    verdict_note: String(formData.get("verdict_note") || "").trim() || null,
    held_on: heldOn || null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) back(companyId, `error=${encodeURIComponent("保存できませんでした（SQL 0021 が未実行の可能性があります）：" + error.message)}`);

  // URL → 会社の資料（website）。同じURLは二重に入れない
  const urls = String(formData.get("urls") || "").split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));
  if (urls.length) {
    const { data: ex } = await supabase.from("company_documents").select("url").eq("company_id", companyId).not("url", "is", null);
    const have = new Set((ex ?? []).map((d) => d.url));
    const rows = urls.filter((u) => !have.has(u)).map((u) => ({ company_id: companyId, kind: "website", title: new URL(u).hostname + new URL(u).pathname.replace(/\/$/, ""), url: u, uploaded_by: user.id }));
    if (rows.length) await supabase.from("company_documents").insert(rows);
  }
  revalidatePath(`/admin/${companyId}/intake`);
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/step0");
  back(companyId, "ok=saved");
}

/** 書き起こしを登録（貼り付け、または .txt/.md/.vtt/.pdf のファイル）。前のものは置き換える */
export async function saveTranscript(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = String(formData.get("company_id"));
  let text = String(formData.get("transcript_text") || "").trim();
  let name = text ? "貼り付け" : "";
  const f = formData.get("transcript_file");
  if (f instanceof File && f.size > 0) {
    if (f.size > 20 * 1024 * 1024) back(companyId, `error=${encodeURIComponent("ファイルが大きすぎます（20MBまで）")}`);
    const buf = Buffer.from(await f.arrayBuffer());
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      const { pdfText } = await import("@/server/extract");
      const r = await pdfText(buf);
      if (!r.text) back(companyId, `error=${encodeURIComponent("PDFから文字を取り出せませんでした" + (r.error ? "：" + r.error : ""))}`);
      text = r.text;
    } else {
      text = buf.toString("utf8").replace(/^﻿/, "").trim();
    }
    name = f.name;
  }
  if (!text) back(companyId, `error=${encodeURIComponent("書き起こしの文字が空です")}`);
  const { error } = await createAdminClient().from("diagnosis_intakes").upsert(
    { company_id: companyId, transcript: text.slice(0, MAX_TRANSCRIPT), transcript_name: name, updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: "company_id" },
  );
  if (error) back(companyId, `error=${encodeURIComponent("保存できませんでした（SQL 0021 が未実行の可能性があります）：" + error.message)}`);
  await supabase.from("activity_log").insert({ company_id: companyId, user_id: user.id, event: "intake.transcript", payload: { name, chars: Math.min(text.length, MAX_TRANSCRIPT) } });
  revalidatePath(`/admin/${companyId}/intake`);
  back(companyId, "ok=transcript");
}

export async function removeTranscript(formData: FormData) {
  const { user } = await requireOperator();
  const companyId = String(formData.get("company_id"));
  await createAdminClient().from("diagnosis_intakes").update({ transcript: null, transcript_name: null, updated_by: user.id, updated_at: new Date().toISOString() }).eq("company_id", companyId);
  revalidatePath(`/admin/${companyId}/intake`);
  back(companyId, "ok=removed");
}
