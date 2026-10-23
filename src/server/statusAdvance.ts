import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { ADVANCE_AFTER_MEETING } from "@/lib/meetings";
import { changeStatus } from "@/server/statusChange";

// 呼び出し側（ベレネッツの操作）で requireOperator を確かめてから使う。
// "use server" のファイルから export するとブラウザから直接呼べる口になるため、ここ（server-only）に置く

/** 状態を変える（会社ページの「変更」と、面談実施済→自動前進から使う）。本体は server/statusChange.ts（毎朝の自動処理と共用） */
export async function applyStatus(supabase: SupabaseClient, id: string, status: string): Promise<boolean> {
  const ok = await changeStatus(supabase, id, status);
  if (ok) revalidatePath("/", "layout");
  return ok;
}

/** キックオフを実施済にしたら、契約前／キックオフ前の会社は「骨格をつくる（1〜2週目）」に進める（お客様側に STEP 1 が開く） */
export async function advanceAfterKickoff(supabase: SupabaseClient, companyId: string): Promise<boolean> {
  return !!(await advanceAfterMeeting(supabase, companyId, "kickoff"));
}

/**
 * 面談を実施済みにしたとき、プログラムの状態を次へ進める（operator 操作の一部として扱う）。
 * kickoff: diagnosed/onboarding → week1_2 ／ session1: week1_2 → week3_5 ／ session2: week3_5 → week6_8
 * 進めたら新しい状態を返す。進める必要が無ければ null
 */
export async function advanceAfterMeeting(supabase: SupabaseClient, companyId: string, kind: string): Promise<string | null> {
  const { data: c } = await supabase.from("companies").select("status, kickoff_at").eq("id", companyId).single();
  if (!c) return null;
  if (kind === "kickoff" && !c.kickoff_at) await supabase.from("companies").update({ kickoff_at: new Date().toISOString() }).eq("id", companyId);
  const rule = ADVANCE_AFTER_MEETING[kind];
  if (!rule || !rule.from.includes(c.status)) return null;
  return (await applyStatus(supabase, companyId, rule.to)) ? rule.to : null;
}

