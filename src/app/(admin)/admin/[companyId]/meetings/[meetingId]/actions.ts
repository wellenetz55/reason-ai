"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { readTranscript, MAX_TRANSCRIPT } from "@/server/transcript";
import { advanceAfterMeeting } from "@/app/(admin)/admin/actions";

const back = (companyId: string, meetingId: string, q: string): never => redirect(`/admin/${companyId}/meetings/${meetingId}?${q}`);
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** 面談の記録を保存（書き起こし・外すも同じフォームで1回で。入力中の内容が消えないように） */
export async function saveMeetingRecord(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = s(formData, "company_id");
  const meetingId = s(formData, "meeting_id");
  const admin = createAdminClient();
  const { data: m } = await admin.from("company_meetings").select("id, company_id, kind").eq("id", meetingId).eq("company_id", companyId).maybeSingle();
  if (!m) back(companyId, meetingId, `error=${encodeURIComponent("面談が見つかりません")}`);

  const patch: Record<string, unknown> = {
    meeting_id: meetingId, company_id: companyId,
    attendees: s(formData, "attendees") || null,
    one_liner: s(formData, "one_liner") || null,
    notes: s(formData, "notes") || null,
    memo: s(formData, "memo") || null,
    pairs_text: s(formData, "pairs_text") || null,
    updated_by: user.id, updated_at: new Date().toISOString(),
  };
  const removing = formData.get("remove_transcript") === "1";
  const tr = removing ? null : await readTranscript(formData);
  if (removing) { patch.transcript = null; patch.transcript_name = null; }
  if (tr && "text" in tr) { patch.transcript = tr.text.slice(0, MAX_TRANSCRIPT); patch.transcript_name = tr.name; }
  const { error } = await admin.from("meeting_records").upsert(patch, { onConflict: "meeting_id" });
  if (error) back(companyId, meetingId, `error=${encodeURIComponent("保存できませんでした" + (/meeting_records/.test(error.message) ? "（SQL 0026 が未実行の可能性があります）" : "") + "：" + error.message)}`);
  let advanced = false;
  if (formData.get("held") === "1") {
    await admin.from("company_meetings").update({ held_at: new Date().toISOString() }).eq("id", meetingId);
    // 実施済みにしたら、この種類の「日程が選ばれました（URLを入れる）」は済み
    await admin.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("company_id", companyId).is("resolved_at", null).contains("payload", { type: "meeting_chosen", kind: m!.kind });
    advanced = !!(await advanceAfterMeeting(admin, companyId, m!.kind));
  }
  await supabase.from("activity_log").insert({ company_id: companyId, user_id: user.id, event: "admin.meeting.record", payload: { meeting_id: meetingId, kind: m!.kind, transcript: !!(tr && "text" in tr) } });
  revalidatePath(`/admin/${companyId}`);
  revalidatePath(`/admin/${companyId}/meetings/${meetingId}`);
  revalidatePath("/", "layout");
  if (tr && "error" in tr) back(companyId, meetingId, `error=${encodeURIComponent("記録は保存しました。" + tr.error)}`);
  if (advanced) back(companyId, meetingId, "ok=advanced");
  back(companyId, meetingId, removing ? "ok=removed" : tr && "text" in tr ? "ok=saved_tr" : "ok=saved");
}

/**
 * 「その場で作った組」を提供価値シートの行として入れる。1行1組、「提供価値｜体験価値」（｜ または | で区切る。体験価値は無くてもよい）。
 * created_by は operator。facet は functional、round 1。二重に入れないよう、同じ提供価値がすでにあれば飛ばす。
 */
export async function importPairs(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = s(formData, "company_id");
  const meetingId = s(formData, "meeting_id");
  const admin = createAdminClient();
  const { data: r } = await admin.from("meeting_records").select("pairs_text").eq("meeting_id", meetingId).eq("company_id", companyId).maybeSingle();
  const lines = String(r?.pairs_text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) back(companyId, meetingId, `error=${encodeURIComponent("「その場で作った組」が空です。先に書いて保存してください")}`);
  const { data: ex } = await admin.from("sheet_rows").select("value_raw, seq").eq("company_id", companyId);
  const have = new Set((ex ?? []).map((x) => (x.value_raw as string).trim()));
  let seq = Math.max(0, ...(ex ?? []).map((x) => x.seq as number)) + 1;
  const rows: Record<string, unknown>[] = [];
  for (const l of lines) {
    const [v, e] = l.split(/[｜|]/).map((x) => x.trim());
    if (!v || have.has(v)) continue;
    have.add(v);
    rows.push({ company_id: companyId, seq: seq++, value_raw: v, experience_value_v1: e || null, facet: "functional", round: 1, created_by: "operator" });
  }
  if (!rows.length) back(companyId, meetingId, `error=${encodeURIComponent("入れる組がありません（すべて登録済みか、形が読めません）")}`);
  const { error } = await admin.from("sheet_rows").insert(rows);
  if (error) back(companyId, meetingId, `error=${encodeURIComponent("シートに入れられませんでした：" + error.message)}`);
  await admin.from("meeting_records").update({ pairs_imported_at: new Date().toISOString() }).eq("meeting_id", meetingId);
  await supabase.from("activity_log").insert({ company_id: companyId, user_id: user.id, event: "admin.meeting.pairs_import", payload: { meeting_id: meetingId, count: rows.length } });
  revalidatePath(`/admin/${companyId}`);
  revalidatePath(`/admin/${companyId}/meetings/${meetingId}`);
  revalidatePath("/", "layout");
  back(companyId, meetingId, `ok=imported&n=${rows.length}`);
}
