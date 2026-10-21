import type { SupabaseClient } from "@supabase/supabase-js";
import { MEETING_AFTER_STEP } from "@/lib/meetings";

export type MeetingNext = { kind: string; label: string; at: string | null; held: boolean; url: string | null };

/**
 * あるステップの直後に挟まるベレネッツ面談（確認セッション①など）の状況。
 * 実施済み → held / 日程あり → at / 未定 → at=null（「日程はベレネッツから連絡」と表示する）
 */
export async function loadMeetingAfter(supabase: SupabaseClient, companyId: string, stageKey: string): Promise<MeetingNext | null> {
  const def = MEETING_AFTER_STEP[stageKey];
  if (!def) return null;
  const { data } = await supabase
    .from("company_meetings")
    .select("scheduled_at, held_at, meeting_url")
    .eq("company_id", companyId)
    .eq("kind", def.kind)
    .order("scheduled_at", { ascending: false });
  const list = data ?? [];
  const held = list.find((m) => m.held_at);
  if (held) return { kind: def.kind, label: def.label, at: held.held_at, held: true, url: null };
  const recent = new Date(Date.now() - 3 * 3600_000);
  const upcoming = list.filter((m) => !m.held_at && new Date(m.scheduled_at) >= recent).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  return { kind: def.kind, label: def.label, at: upcoming?.scheduled_at ?? null, held: false, url: upcoming?.meeting_url ?? null };
}
