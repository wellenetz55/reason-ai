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
  for (const k of [...Q_KEYS, "extra", "memo", "attendees"]) answers[k] = String(formData.get(k) || "").trim();
  const targetName = String(formData.get("target_name") || "").trim();
  const heldOn = String(formData.get("held_on") || "").trim();
  const verdict = String(formData.get("verdict") || "").trim();
  const { error } = await supabase.from("diagnosis_intakes").upsert({
    company_id: companyId,
    target_kind: ["company", "brand", "product"].includes(kind) ? kind : "company",
    target_name: targetName || null,
    target_note: String(formData.get("target_note") || "").trim() || null,
    answers,
    verdict: ["fit", "unfit", "hold"].includes(verdict) ? verdict : null,
    verdict_note: String(formData.get("verdict_note") || "").trim() || null,
    held_on: heldOn || null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (error) back(companyId, `error=${encodeURIComponent("保存できませんでした（SQL 0021 が未実行の可能性があります）：" + error.message)}`);
  revalidatePath(`/admin/${companyId}/intake`);
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/step0");

  // URL → 会社の資料（website）。末尾の / を揃えて比べ、同じURLは二重に入れない。形の壊れたURLは飛ばして知らせる
  const norm = (u: string) => { try { const x = new URL(u); return x.protocol.startsWith("http") ? x.href.replace(/\/$/, "") : null; } catch { return null; } };
  const tokens = String(formData.get("urls") || "").split(/\s+/).map((u) => u.trim()).filter(Boolean).map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`));
  const bad = tokens.filter((u) => !norm(u));
  const wanted = [...new Set(tokens.map(norm).filter((u): u is string => !!u))];
  if (wanted.length) {
    const { data: ex } = await supabase.from("company_documents").select("url").eq("company_id", companyId).not("url", "is", null);
    const have = new Set((ex ?? []).map((d) => norm(d.url ?? "")));
    const rows = wanted.filter((u) => !have.has(u)).map((u) => { const x = new URL(u); return { company_id: companyId, kind: "website", title: x.hostname + x.pathname.replace(/\/$/, ""), url: u, uploaded_by: user.id }; });
    if (rows.length) {
      const { error: ue } = await supabase.from("company_documents").insert(rows);
      if (ue) back(companyId, `error=${encodeURIComponent("記録は保存しましたが、URLを登録できませんでした：" + ue.message)}`);
    }
  }
  if (bad.length) back(companyId, `error=${encodeURIComponent("記録は保存しました。次のURLは形が正しくないため登録していません：" + bad.join(" "))}`);
  if (kind !== "company" && !targetName) back(companyId, `error=${encodeURIComponent("記録は保存しました。事業部・ブランド、商品・サービスを選んだときは、対象の名前も入れてください（AIが会社全体と取り違えないため）")}`);
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
    if (f.size > 4 * 1024 * 1024) back(companyId, `error=${encodeURIComponent("ファイルが大きすぎます（4MBまで）。テキスト（.txt）で書き出すと小さくなります")}`);
    const buf = Buffer.from(await f.arrayBuffer());
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      const { pdfText } = await import("@/server/extract");
      const r = await pdfText(buf);
      if (!r.text) back(companyId, `error=${encodeURIComponent("PDFから文字を取り出せませんでした" + (r.error ? "：" + r.error : ""))}`);
      text = r.text;
    } else {
      text = buf.toString("utf8").replace(/^﻿/, "");
      // 文字化けしている（Shift_JIS で書き出されたファイル）なら Shift_JIS で読み直す
      if (text.includes("�")) {
        try { text = new TextDecoder("shift_jis").decode(buf); } catch { /* そのまま */ }
      }
      text = text.trim();
    }
    name = f.name;
  }
  if (!text) back(companyId, `error=${encodeURIComponent("書き起こしの文字が空です")}`);
  const { error } = await createAdminClient().from("diagnosis_intakes").upsert(
    { company_id: companyId, transcript: text.slice(0, MAX_TRANSCRIPT), transcript_name: name, updated_by: user.id, updated_at: new Date().toISOString() },
    { onConflict: "company_id" },
  );
  if (error) back(companyId, `error=${encodeURIComponent("保存できませんでした（SQL 0021 が未実行の可能性があります）：" + error.message)}`);
  revalidatePath(`/admin/${companyId}/intake`);
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/step0");
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
