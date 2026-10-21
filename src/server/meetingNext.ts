import type { SupabaseClient } from "@supabase/supabase-js";
import { MEETING_AFTER_STEP } from "@/lib/meetings";

export type MeetingNext = { kind: string; label: string; at: string | null; held: boolean; url: string | null; candidates: string[] };

/**
 * あるステップの直後に挟まるベレネッツ面談（確認セッション①など）の状況。
 * 実施済み → held / 日程が1つ → at（確定）/ 複数 → candidates（お客様が1つ選ぶ）/ 無し → at=null（「日程はベレネッツから連絡」）
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
  if (held) return { kind: def.kind, label: def.label, at: held.held_at, held: true, url: null, candidates: [] };
  const recent = new Date(Date.now() - 3 * 3600_000);
  const upcoming = list.filter((m) => !m.held_at && new Date(m.scheduled_at) >= recent).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  if (upcoming.length > 1) {
    return { kind: def.kind, label: def.label, at: null, held: false, url: null, candidates: [...new Set(upcoming.map((m) => new Date(m.scheduled_at).toISOString()))].slice(0, 5) };
  }
  return { kind: def.kind, label: def.label, at: upcoming[0]?.scheduled_at ?? null, held: false, url: upcoming[0]?.meeting_url ?? null, candidates: [] };
}
