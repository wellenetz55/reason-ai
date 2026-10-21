"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOperators } from "@/server/notify";
import { MEETING_LABEL, fmtMeeting } from "@/lib/meetings";

const PICKABLE = ["session1", "midcheck", "session2", "session3"];

/**
 * ベレネッツが候補として複数入れた面談（確認セッションなど）から、お客様が1つ選ぶ。
 * 選んだ日時の面談を残し（会議URLは残る）、ほかの未実施の候補は外す。ベレネッツに通知。
 */
export async function chooseMeeting(formData: FormData) {
  const { company, user } = await requireCustomer();
  const kind = String(formData.get("kind") || "");
  const iso = String(formData.get("date") || "");
  if (!PICKABLE.includes(kind) || !iso || Number.isNaN(Date.parse(iso)) || new Date(iso) <= new Date()) return;
  const admin = createAdminClient();
  const { data: ms } = await admin.from("company_meetings").select("id, scheduled_at").eq("company_id", company.id).eq("kind", kind).is("held_at", null);
  const t = new Date(iso).getTime();
  const same = (ms ?? []).find((m) => new Date(m.scheduled_at as string).getTime() === t);
  if (!same) return; // 候補に無い日時は選べない
  const others = (ms ?? []).filter((m) => m.id !== same.id);
  if (others.length) await admin.from("company_meetings").delete().in("id", others.map((m) => m.id));
  const label = MEETING_LABEL[kind] ?? kind;
  await admin.from("alerts").insert({ company_id: company.id, kind: "escalation", payload: { type: "meeting_chosen", kind, date: iso, by: user.id } });
  await admin.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "meeting.choose", payload: { kind, date: iso } });
  await notifyOperators({ subject: `${company.name} が${label}の日程を選びました（${fmtMeeting(iso)}）`, lines: [`${company.name} の担当者が、${label}の日程を ${fmtMeeting(iso)} に決めました。`, "面談に会議URLを入れてください。ほかの候補日は自動で外しました。"], path: `/admin/${company.id}` });
  revalidatePath("/", "layout");
}
