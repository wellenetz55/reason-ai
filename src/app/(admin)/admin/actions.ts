"use server";
import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/session";

export async function createCompany(formData: FormData) {
  const { supabase } = await requireOperator();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await supabase.from("companies").insert({ name, status: "diagnosed" });
  revalidatePath("/admin");
}

export async function setStatus(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("company_id"));
  const status = String(formData.get("status"));
  await supabase.from("companies").update({ status, status_changed_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/admin/${id}`);
  revalidatePath("/admin");
}

const MEETING_KINDS = ["kickoff", "session1", "midcheck", "session2", "session3", "advisor_monthly", "internal"] as const;

/** 面談を登録。日時はJSTで入力されたものをUTCに変換して保存 */
export async function createMeeting(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = String(formData.get("company_id"));
  const kind = String(formData.get("kind"));
  const local = String(formData.get("scheduled_at") || ""); // "2026-10-13T14:00"（JST）
  const url = String(formData.get("meeting_url") || "").trim();
  if (!companyId || !local || !(MEETING_KINDS as readonly string[]).includes(kind)) return;
  const scheduledAt = new Date(`${local}:00+09:00`).toISOString();
  await supabase.from("company_meetings").insert({
    company_id: companyId,
    kind,
    scheduled_at: scheduledAt,
    meeting_url: url || null,
    created_by: user.id,
  });
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/");
}

export async function updateMeeting(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("id"));
  const companyId = String(formData.get("company_id"));
  const local = String(formData.get("scheduled_at") || "");
  const url = String(formData.get("meeting_url") || "").trim();
  const patch: Record<string, unknown> = { meeting_url: url || null };
  if (local) patch.scheduled_at = new Date(`${local}:00+09:00`).toISOString();
  if (formData.get("held") === "1") patch.held_at = new Date().toISOString();
  await supabase.from("company_meetings").update(patch).eq("id", id);
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/");
}

/** 顧客の質問に返事する。顧客側では質問の直下に表示される */
export async function answerQuestion(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("id"));
  const companyId = String(formData.get("company_id"));
  const body = String(formData.get("answered_body") || "").trim();
  if (!id || !body) return;
  await supabase.from("questions_to_operator").update({ answered_body: body, answered_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/ask");
}

export async function resolveErrorReport(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("id"));
  const companyId = String(formData.get("company_id"));
  await supabase.from("error_reports").update({ resolved_at: new Date().toISOString(), resolved_note: String(formData.get("note") || "").trim() || null }).eq("id", id);
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/admin");
  revalidatePath("/report");
}

/** 顧客のサインインリンクを発行（メールが届かないときにベレネッツが直接渡す）。URLはクエリで会社ページに返す */
export async function issueSignInLink(formData: FormData) {
  await requireOperator();
  const companyId = String(formData.get("company_id"));
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) return;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("id").eq("company_id", companyId);
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = list?.users.find((x) => x.email?.toLowerCase() === email);
  if (!u || !(prof ?? []).some((p) => p.id === u.id)) {
    const { redirect } = await import("next/navigation");
    redirect(`/admin/${companyId}?link_error=${encodeURIComponent("その会社の担当者として登録されていないメールアドレスです")}`);
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` } });
  const { redirect } = await import("next/navigation");
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) redirect(`/admin/${companyId}?link_error=${encodeURIComponent(error?.message ?? "発行できませんでした")}`);
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?token_hash=${encodeURIComponent(hashed!)}&type=magiclink`;
  redirect(`/admin/${companyId}?link=${encodeURIComponent(url)}`);
}
