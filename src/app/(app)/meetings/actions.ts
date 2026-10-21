"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOperators } from "@/server/notify";
import { MEETING_LABEL, fmtMeeting } from "@/lib/meetings";

const PICKABLE = ["session1", "midcheck", "session2", "session3"];

/** 書き込みできる会社か。編集終了・解約（再アクセス中も含む）は不可。契約前（diagnosed）はキックオフだけ可 */
function canTouch(status: string, kind: string) {
  if (["locked", "cancelled"].includes(status)) return false;
  if (status === "diagnosed" && kind !== "kickoff") return false;
  return true;
}

/**
 * ベレネッツが候補として複数入れた面談（確認セッションなど）から、お客様が1つ選ぶ。
 * 選んだ日時の面談を残し（会議URLは残る）、ほかの未実施の候補は外す。ベレネッツに通知。
 */
export async function chooseMeeting(formData: FormData) {
  const { company, user } = await requireCustomer();
  const kind = String(formData.get("kind") || "");
  const iso = String(formData.get("date") || "");
  if (!canTouch(company.status, kind)) return;
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

const DECLINABLE = ["kickoff", ...PICKABLE];

/**
 * 「すべての日程が難しい（別日を希望）」。候補はすべて外し、ベレネッツに新しい候補を出してもらう。
 * お客様に希望日を入れさせない（候補の提示はベレネッツ側からのみ）。
 */
export async function requestOtherDates(formData: FormData) {
  const { company, user } = await requireCustomer();
  const kind = String(formData.get("kind") || "");
  if (!DECLINABLE.includes(kind) || !canTouch(company.status, kind)) return;
  const admin = createAdminClient();
  const { data: ms } = await admin.from("company_meetings").select("id, scheduled_at").eq("company_id", company.id).eq("kind", kind).is("held_at", null);
  const future = (ms ?? []).filter((m) => new Date(m.scheduled_at as string).getTime() > Date.now());
  if (future.length) await admin.from("company_meetings").delete().in("id", future.map((m) => m.id));
  if (kind === "kickoff") await admin.from("diagnosis_results").update({ candidate_dates: [] }).eq("company_id", company.id);
  const label = MEETING_LABEL[kind] ?? kind;
  // 同じ種類の「別日希望」が未対応で残っていれば重ねて出さない
  const { data: dup } = await admin.from("alerts").select("id").eq("company_id", company.id).is("resolved_at", null).contains("payload", { type: "dates_declined", kind }).limit(1).maybeSingle();
  if (!dup) await admin.from("alerts").insert({ company_id: company.id, kind: "escalation", payload: { type: "dates_declined", kind, by: user.id } });
  await admin.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "meeting.decline_dates", payload: { kind, n: future.length } });
  await notifyOperators({ subject: `${company.name}：${label}の候補日がすべて合いませんでした（別日を希望）`, lines: [`${company.name} の担当者が、${label}の候補日について「すべての日程が難しい」を選びました。`, "管理画面の面談に、新しい候補日を3つほど登録してください（登録するとお客様の画面に候補として出ます）。"], path: `/admin/${company.id}` });
  revalidatePath("/", "layout");
}
