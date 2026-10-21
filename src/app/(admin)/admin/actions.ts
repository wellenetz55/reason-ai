"use server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  await applyStatus(supabase, id, status);
  revalidatePath(`/admin/${id}`);
  revalidatePath("/admin");
}

/** 状態を変える本体（会社ページの「変更」と、キックオフ実施済→自動で「骨格をつくる」から使う）。同じ状態なら何もしない */
export async function applyStatus(supabase: SupabaseClient, id: string, status: string): Promise<boolean> {
  const { data: before } = await supabase.from("companies").select("status").eq("id", id).single();
  if (before?.status === status) return false;
  const nowD = new Date();
  const patch: Record<string, string> = { status, status_changed_at: nowD.toISOString() };
  // 猶予・延長は終わりの日を決める（毎朝の自動処理がこの日を過ぎたら次の状態に移す）。期限は会社ページで変えられる
  if (status === "grace") { const d = new Date(nowD); d.setMonth(d.getMonth() + 1); patch.grace_until = d.toISOString(); }
  if (status === "extended") patch.extension_until = new Date(nowD.getTime() + 28 * 86_400_000).toISOString();
  await supabase.from("companies").update(patch).eq("id", id);
  // 進行中の状態を抜けたら「7日操作なし」は済みにする（毎朝の処理は進行中の会社しか見ないため）
  if (!["onboarding", "week1_2", "week3_5", "week6_8", "extended"].includes(status)) {
    await supabase.from("alerts").update({ resolved_at: nowD.toISOString() }).eq("company_id", id).eq("kind", "stale7").is("resolved_at", null);
  }
  // 状態が変わったら、解約後の一時再アクセスは閉じる（列が無い環境ではエラーを無視）
  await supabase.from("companies").update({ reaccess_until: null }).eq("id", id).not("reaccess_until", "is", null);
  if (status !== "week1_2") await supabase.from("alerts").update({ resolved_at: nowD.toISOString() }).eq("company_id", id).is("resolved_at", null).contains("payload", { type: "step2_done" });
  // 契約前を抜けたら、契約前の要対応アラート（申込・診断閲覧・キックオフ選択）を済みにする
  if (status !== "diagnosed") {
    const now = new Date().toISOString();
    for (const type of ["program_applied", "diagnosis_viewed", "kickoff_chosen"]) {
      await supabase.from("alerts").update({ resolved_at: now }).eq("company_id", id).is("resolved_at", null).contains("payload", { type });
    }
  }
  revalidatePath("/", "layout");
  return true;
}

/** キックオフを実施済にしたら、契約前／キックオフ前の会社は「骨格をつくる（1〜2週目）」に進める（お客様側に STEP 1 が開く） */
export async function advanceAfterKickoff(supabase: SupabaseClient, companyId: string): Promise<boolean> {
  const { data: c } = await supabase.from("companies").select("status, kickoff_at").eq("id", companyId).single();
  if (!c) return false;
  if (!c.kickoff_at) await supabase.from("companies").update({ kickoff_at: new Date().toISOString() }).eq("id", companyId);
  if (c.status !== "diagnosed" && c.status !== "onboarding") return false;
  return applyStatus(supabase, companyId, "week1_2");
}

/** 会社の担当者を登録して招待メールを送る（既存アカウントならマジックリンク） */
export async function inviteCustomer(formData: FormData) {
  const { supabase } = await requireOperator();
  const companyId = String(formData.get("company_id"));
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("display_name") || "").trim();
  const { redirect } = await import("next/navigation");
  if (!email) return;
  const { data: co } = await supabase.from("companies").select("status").eq("id", companyId).single();
  const gate = await (await import("@/server/intake")).inviteGate(companyId, co?.status ?? "diagnosed");
  if (!gate.ok) redirect(`/admin/${companyId}?member_error=${encodeURIComponent(gate.reason)}`);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
  if (existing) {
    const { data: prof } = await admin.from("profiles").select("role, company_id, display_name").eq("id", existing.id).maybeSingle();
    if (prof?.role === "operator") redirect(`/admin/${companyId}?member_error=${encodeURIComponent("そのメールアドレスは運営者です。顧客の担当者には登録できません")}`);
    if (prof?.company_id && prof.company_id !== companyId) redirect(`/admin/${companyId}?member_error=${encodeURIComponent("そのメールアドレスは別の会社の担当者として登録済みです")}`);
    await admin.from("profiles").upsert({ id: existing.id, company_id: companyId, role: prof?.role ?? "customer_member", display_name: name || prof?.display_name || existing.email });
    await admin.auth.signInWithOtp({ email, options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`, shouldCreateUser: false } });
  } else {
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` });
    if (error || !invited?.user) redirect(`/admin/${companyId}?member_error=${encodeURIComponent(error?.message ?? "招待できませんでした")}`);
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId);
    await admin.from("profiles").upsert({ id: invited!.user!.id, company_id: companyId, role: (count ?? 0) === 0 ? "customer_admin" : "customer_member", display_name: name || email });
  }
  revalidatePath(`/admin/${companyId}`);
  redirect(`/admin/${companyId}?member_ok=1`);
}

const CONTRACT_COLS = { applied: "applied_at", contracted: "contracted_at", paid: "paid_at" } as const;

/** 申込・契約・入金の日時を記録する／取り消す（契約と請求そのものはアプリ外） */
export async function setContractStep(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("company_id"));
  const step = String(formData.get("step")) as keyof typeof CONTRACT_COLS;
  const col = CONTRACT_COLS[step];
  if (!col) return;
  const clear = formData.get("clear") === "1";
  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { [col]: clear ? null : now };
  if (!clear) {
    // 後の段階を記録したら、空いている前の段階も同時に埋める（顧客画面の進み具合が矛盾しないように）
    const { data: cur } = await supabase.from("companies").select("applied_at, contracted_at").eq("id", id).single();
    if ((step === "contracted" || step === "paid") && !cur?.applied_at) patch.applied_at = now;
    if (step === "paid" && !cur?.contracted_at) patch.contracted_at = now;
  }
  if (clear) {
    // 前の段階を取り消したら、後の段階もまとめて取り消す（顧客画面と食い違わないように）
    if (step === "applied") { patch.contracted_at = null; patch.paid_at = null; }
    if (step === "contracted") patch.paid_at = null;
  }
  await supabase.from("companies").update(patch).eq("id", id);
  // 申込以降のどの段階を記録しても、「申込がありました」は対応済み。契約以降なら「診断結果を開きました」も済み
  // 入金を確認したら、お客様にキックオフ日を選んでもらう案内を送る
  if (!clear && step === "paid") {
    const { customerEmails, notifyCustomer } = await import("@/server/notify");
    const { data: co } = await supabase.from("companies").select("name").eq("id", id).single();
    // 候補日（「適合診断の結果を書く」で最大3つ）のうち、まだ過ぎていないものがあるときだけ「選んでください」と送る
    const { data: dr } = await supabase.from("diagnosis_results").select("candidate_dates, chosen_date").eq("company_id", id).maybeSingle();
    const future = ((dr?.candidate_dates ?? []) as string[]).filter((d) => new Date(d) > new Date());
    if (!dr?.chosen_date) {
      const lines = future.length
        ? ["ご入金を確認しました。ありがとうございます。", `選ばれる理由AIにサインインし、診断結果の画面で、キックオフ（3時間・オンライン）の日を候補の${future.length}つからお選びください。`]
        : ["ご入金を確認しました。ありがとうございます。", "キックオフ（3時間・オンライン）の候補日は、あらためてベレネッツからご連絡します。"];
      for (const to of await customerEmails(id)) {
        await notifyCustomer({ to, subject: future.length ? "ご入金を確認しました。キックオフ日をお選びください" : "ご入金を確認しました", lines: [co?.name ?? "", "ご担当者様", "", ...lines, "", "株式会社ベレネッツ"], path: "/diagnosis" });
      }
    }
  }
  if (!clear) {
    await supabase.from("alerts").update({ resolved_at: now }).eq("company_id", id).is("resolved_at", null).contains("payload", { type: "program_applied" });
    if (step !== "applied") await supabase.from("alerts").update({ resolved_at: now }).eq("company_id", id).is("resolved_at", null).contains("payload", { type: "diagnosis_viewed" });
  }
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
  // 確認セッション①を登録したら「日程を決める番」のアラートは済み
  if (kind === "session1") await supabase.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("company_id", companyId).is("resolved_at", null).contains("payload", { type: "step2_done" });
  // 同じ種類の「別日を希望」は、新しい候補を登録した時点で済み
  await supabase.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("company_id", companyId).is("resolved_at", null).contains("payload", { type: "dates_declined", kind });
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
  if (formData.get("unheld") === "1") patch.held_at = null; // 押し間違いを戻す（記録はそのまま残る）
  await supabase.from("company_meetings").update(patch).eq("id", id);
  // URLを入れた／実施済みにしたら「日程が選ばれました」のアラートは済み
  if (url || formData.get("held") === "1") {
    const { data: mk } = await supabase.from("company_meetings").select("kind").eq("id", id).maybeSingle();
    if (mk?.kind) await supabase.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("company_id", companyId).is("resolved_at", null).contains("payload", { type: "meeting_chosen", kind: mk.kind });
  }
  if (formData.get("held") === "1") {
    const { data: m } = await supabase.from("company_meetings").select("kind").eq("id", id).maybeSingle();
    if (m?.kind === "kickoff" && (await advanceAfterKickoff(supabase, companyId))) {
      revalidatePath(`/admin/${companyId}`);
      redirect(`/admin/${companyId}?status_ok=${encodeURIComponent("キックオフを実施済にしたので、状態を「骨格をつくる（1〜2週目）」に進めました。お客様側に STEP 1 が開きます")}`);
    }
  }
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
  // トークンをURLに載せない（履歴・ログに残るため）。1回だけ読める短命クッキーで渡す
  const { cookies } = await import("next/headers");
  (await cookies()).set("issued_link", url, { httpOnly: true, secure: true, sameSite: "lax", path: `/admin/${companyId}`, maxAge: 120 });
  redirect(`/admin/${companyId}?link=1`);
}

/** 解約した会社に、期限付きでダウンロードを戻す（days=0 で取り消し）。状態（cancelled）は変えない */
export async function setReaccess(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("company_id"));
  const days = Number(formData.get("days") || 0);
  const until = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const { error } = await supabase.from("companies").update({ reaccess_until: until }).eq("id", id).eq("status", "cancelled");
  const { redirect } = await import("next/navigation");
  if (error) redirect(`/admin/${id}?status_error=${encodeURIComponent("保存できませんでした（migration 0016 が未適用の可能性があります）：" + error.message)}`);
  revalidatePath(`/admin/${id}`);
  revalidatePath("/", "layout");
}

/** 猶予・延長の終わりの日を変える（日本時間の日付。その日の終わりまで） */
export async function setPhaseEnd(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("company_id"));
  const col = String(formData.get("col"));
  const day = String(formData.get("until") || "").trim();
  if (!["grace_until", "extension_until"].includes(col) || !day) return;
  await supabase.from("companies").update({ [col]: new Date(`${day}T23:59:00+09:00`).toISOString() }).eq("id", id);
  revalidatePath(`/admin/${id}`);
}

/** アラートを手で「済み」にする */
export async function resolveAlert(formData: FormData) {
  const { supabase } = await requireOperator();
  const id = String(formData.get("id"));
  const companyId = String(formData.get("company_id") || "");
  await supabase.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("id", id).is("resolved_at", null);
  revalidatePath("/admin");
  if (companyId) revalidatePath(`/admin/${companyId}`);
}
