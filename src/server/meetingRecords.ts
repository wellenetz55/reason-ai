import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEETING_LABEL, fmtMeeting } from "@/lib/meetings";

export type MeetingRecord = {
  meeting_id: string;
  company_id: string;
  attendees: string | null;
  one_liner: string | null;
  notes: string | null;
  memo: string | null;
  pairs_text: string | null;
  pairs_imported_at: string | null;
  transcript: string | null;
  transcript_name: string | null;
  updated_at: string;
};

const COLS = "meeting_id, company_id, attendees, one_liner, notes, memo, pairs_text, pairs_imported_at, transcript_name, updated_at";

export async function loadMeetingRecord(meetingId: string, withTranscript = false): Promise<{ record: MeetingRecord | null; missing: boolean }> {
  const { data, error } = await createAdminClient().from("meeting_records").select(withTranscript ? COLS + ", transcript" : COLS).eq("meeting_id", meetingId).maybeSingle();
  if (error) return { record: null, missing: /meeting_records/.test(error.message) };
  if (!data) return { record: null, missing: false };
  const row = data as unknown as Partial<MeetingRecord>;
  return { record: { ...row, transcript: row.transcript ?? null } as MeetingRecord, missing: false };
}

/**
 * AI下書きに渡す「面談の記録」。新しい面談から順に、要点・一言・書き起こし抜粋・メモファイルの文字を付ける。
 * 「ベレネッツの気づき」（memo）は渡さない。表が無い（SQL 0026 未実行）ときは空。
 */
export async function loadMeetingContext(companyId: string, maxChars = 24_000): Promise<string> {
  const admin = createAdminClient();
  const { data: recs, error } = await admin.from("meeting_records").select("meeting_id, attendees, one_liner, notes, transcript, pairs_text").eq("company_id", companyId);
  if (error || !recs?.length) return "";
  const ids = recs.map((r) => r.meeting_id as string);
  const [{ data: ms }, { data: files }] = await Promise.all([
    admin.from("company_meetings").select("id, kind, scheduled_at, held_at").in("id", ids),
    // 「お客様に見せてよい」にしたファイルだけ（SQL 0048 が未実行なら何も渡さない）
    admin.from("meeting_files").select("meeting_id, name, text_content").in("meeting_id", ids).eq("shareable", true).not("text_content", "is", null),
  ]);
  const meta = Object.fromEntries((ms ?? []).map((m) => [m.id, m]));
  const ordered = [...recs].sort((a, b) => {
    const ta = new Date((meta[a.meeting_id as string]?.held_at ?? meta[a.meeting_id as string]?.scheduled_at ?? 0) as string).getTime();
    const tb = new Date((meta[b.meeting_id as string]?.held_at ?? meta[b.meeting_id as string]?.scheduled_at ?? 0) as string).getTime();
    return tb - ta;
  });
  const parts: string[] = [];
  let left = maxChars;
  for (const r of ordered) {
    const m = meta[r.meeting_id as string];
    const title = `【${MEETING_LABEL[m?.kind as string] ?? "面談"}${m ? " " + fmtMeeting((m.held_at ?? m.scheduled_at) as string) : ""}】`;
    const lines: string[] = [];
    if (r.attendees) lines.push(`相手：${r.attendees}`);
    if (r.one_liner) lines.push(`「御社を一言で言うと？」の答え：${r.one_liner}`);
    if (r.notes) lines.push(`聞いたこと：${(r.notes as string).trim()}`);
    if (r.pairs_text) lines.push(`その場で作った組：\n${(r.pairs_text as string).trim()}`);
    const fs = (files ?? []).filter((f) => f.meeting_id === r.meeting_id).map((f) => `［${f.name}］${(f.text_content as string).trim().slice(0, 4000)}`);
    if (fs.length) lines.push(`メモ・資料：\n${fs.join("\n")}`);
    if (r.transcript) lines.push(`書き起こし（抜粋）：${(r.transcript as string).trim().slice(0, 8000)}`);
    if (!lines.length) continue;
    const block = `${title}\n${lines.join("\n")}`.slice(0, left);
    parts.push(block);
    left -= block.length;
    if (left <= 0) break;
  }
  return parts.join("\n\n");
}
