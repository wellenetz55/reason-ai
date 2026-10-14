"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Q_KEYS } from "@/server/intake";
import { normalizeWebUrl } from "@/lib/url";

const back = (companyId: string, q: string): never => redirect(`/admin/${companyId}/intake?${q}`);
const MAX_TRANSCRIPT = 400_000;

/** フォームの書き起こし（ファイル or 貼り付け）を読む。無ければ null。読めなければ error */
async function readTranscript(formData: FormData): Promise<{ text: string; name: string } | { error: string } | null> {
  let text = String(formData.get("transcript_text") || "").trim();
  let name = text ? "貼り付け" : "";
  const f = formData.get("transcript_file");
  if (f instanceof File && f.size > 0) {
    if (f.size > 4 * 1024 * 1024) return { error: "書き起こしのファイルが大きすぎます（4MBまで）。テキスト（.txt）で書き出すと小さくなります" };
    const buf = Buffer.from(await f.arrayBuffer());
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      const { pdfText } = await import("@/server/extract");
      const r = await pdfText(buf);
      if (!r.text) return { error: "PDFから文字を取り出せませんでした" + (r.error ? "：" + r.error : "") };
      text = r.text;
    } else {
      text = buf.toString("utf8").replace(/^\uFEFF/, "");
      // 文字化けしている（Shift_JIS で書き出されたファイル）なら Shift_JIS で読み直す
      if (text.includes("\uFFFD")) {
        try { text = new TextDecoder("shift_jis").decode(buf); } catch { /* そのまま */ }
      }
      text = text.trim();
    }
    name = f.name;
  }
  if (!text) return null;
  return { text, name };
}

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
  const norm = (u: string) => normalizeWebUrl(u);
  const tokens = String(formData.get("urls") || "").split(/\s+/).map((u) => u.trim()).filter(Boolean);
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
  // 書き起こし（同じフォームで選ばれていれば、記録といっしょに保存する。入力中の内容が消えないように1回で送る）
  const removing = formData.get("remove_transcript") === "1";
  const tr = removing ? null : await readTranscript(formData);
  let trSaved = false;
  if (removing) {
    await createAdminClient().from("diagnosis_intakes").update({ transcript: null, transcript_name: null, updated_by: user.id, updated_at: new Date().toISOString() }).eq("company_id", companyId);
  }
  if (tr && "error" in tr) back(companyId, `error=${encodeURIComponent("記録は保存しました。" + tr.error)}`);
  if (tr && "text" in tr) {
    const { error: te } = await createAdminClient().from("diagnosis_intakes").update({ transcript: tr.text.slice(0, MAX_TRANSCRIPT), transcript_name: tr.name, updated_by: user.id, updated_at: new Date().toISOString() }).eq("company_id", companyId);
    if (te) back(companyId, `error=${encodeURIComponent("記録は保存しましたが、書き起こしを登録できませんでした：" + te.message)}`);
    await supabase.from("activity_log").insert({ company_id: companyId, user_id: user.id, event: "intake.transcript", payload: { name: tr.name, chars: Math.min(tr.text.length, MAX_TRANSCRIPT) } });
    trSaved = true;
  }

  if (bad.length) back(companyId, `error=${encodeURIComponent((trSaved ? "記録と書き起こしは保存しました。" : "記録は保存しました。") + "次のURLは形が正しくないため登録していません：" + bad.join(" "))}`);
  if (kind !== "company" && !targetName) back(companyId, `error=${encodeURIComponent("記録は保存しました。事業部・ブランド、商品・サービスを選んだときは、対象の名前も入れてください（AIが会社全体と取り違えないため）")}`);

  // 「適合診断を始める」：保存したうえで、AIが判定案と結果の下書きを作り、「結果を書く」へ進む
  if (formData.get("start_diagnosis") === "1") {
    const { startDiagnosis } = await import("@/server/diagnosisDraft");
    let r: Awaited<ReturnType<typeof startDiagnosis>>;
    try {
      r = await startDiagnosis(companyId);
    } catch (e) {
      await supabase.from("activity_log").insert({ company_id: companyId, user_id: user.id, event: "diag_draft.error", payload: { message: (e as Error).message } });
      back(companyId, `error=${encodeURIComponent("記録は保存しました。適合診断の下書きは作れませんでした：" + (e as Error).message)}`);
    }
    await supabase.from("activity_log").insert({ company_id: companyId, user_id: user.id, event: "intake.diag_draft", payload: { verdict: r!.verdict, filled: r!.filled } });
    revalidatePath(`/admin/${companyId}/intake`);
    revalidatePath(`/admin/${companyId}/diagnosis`);
    const msg = `AIの判定案は「${r!.verdict}」です（理由は「適合診断の記録」の判定メモに書きました。判定はベレネッツが決めます）。${r!.filled.length ? "下の空いていた欄に下書きを入れました：" + r!.filled.join("・") + "。直してから保存してください。" : r!.note || "空いている欄が無かったため、下書きは入れていません。"}`;
    redirect(`/admin/${companyId}/diagnosis?notice=${encodeURIComponent(msg)}`);
  }
  back(companyId, removing ? "ok=removed" : trSaved ? "ok=saved_tr" : "ok=saved");
}
