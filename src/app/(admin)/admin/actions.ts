"use server";
import { listAllUsers } from "@/server/users";
import { MEETING_LABEL, safeMeetingUrl } from "@/lib/meetings";
import { STATUS_LABEL } from "@/lib/stages";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/session";
import { applyStatus, advanceAfterMeeting } from "@/server/statusAdvance";

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
  const { data: list } = await listAllUsers(admin);
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
  // その会社の最初の1人は担当者（承認・決定ができる人）にする。既にいる人を数えるときは、本人は除く
  const { count: others } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("id", existing?.id ?? "00000000-0000-0000-0000-000000000000");
  const firstRole = (others ?? 0) === 0 ? "customer_admin" : "customer_member";
  if (existing) {
    const { data: prof } = await admin.from("profiles").select("role, company_id, display_name").eq("id", existing.id).maybeSingle();
    if (prof?.role === "operator") redirect(`/admin/${companyId}?member_error=${encodeURIComponent("そのメールアドレスは運営者です。顧客の担当者には登録できません")}`);
    if (prof?.company_id && prof.company_id !== companyId) redirect(`/admin/${companyId}?member_error=${encodeURIComponent("そのメールアドレスは別の会社の担当者として登録済みです")}`);
    await admin.from("profiles").upsert({ id: existing.id, company_id: companyId, role: prof?.role ?? firstRole, display_name: name || prof?.display_name || existing.email, disabled_at: null });
    // 外していた人を追加し直したときは、サインインの停止も解く
    await admin.auth.admin.updateUserById(existing.id, { ban_duration: "none" });
    await admin.auth.signInWithOtp({ email, options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`, shouldCreateUser: false } });
  } else {
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` });
    if (error || !invited?.user) redirect(`/admin/${companyId}?member_error=${encodeURIComponent(error?.message ?? "招待できませんでした")}`);
    await admin.from("profiles").upsert({ id: invited!.user!.id, company_id: companyId, role: firstRole, display_name: name || email });
  }
  revalidatePath(`/admin/${companyId}`);
  redirect(`/admin/${companyId}?member_ok=1`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** お客様の担当者を外す（退職など）。サインインを止める。追加し直せば戻せる。主担当は外せない（先に別の人を主担当にする） */
export async function disableCustomer(formData: FormData) {
  await requireOperator();
  const id = String(formData.get("id") || "");
  const companyId = String(formData.get("company_id") || "");
  if (!UUID_RE.test(id) || !UUID_RE.test(companyId)) return;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("role, company_id").eq("id", id).maybeSingle();
  if (!p || p.company_id !== companyId || p.role === "operator") return;
  if (p.role === "customer_admin") redirect(`/admin/${companyId}?member_error=${encodeURIComponent("主担当は外せません。先に別の人を主担当にしてください")}`);
  await admin.from("profiles").update({ disabled_at: new Date().toISOString() }).eq("id", id);
  await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" }); // 約100年サインインを止める
  revalidatePath(`/admin/${companyId}`);
}

/** 主担当を替える。選んだ人を主担当に、それまでの主担当はメンバーにする（主担当は1人） */
export async function setMainContact(formData: FormData) {
  await requireOperator();
  const id = String(formData.get("id") || "");
  const companyId = String(formData.get("company_id") || "");
  if (!UUID_RE.test(id) || !UUID_RE.test(companyId)) return;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("role, company_id, disabled_at").eq("id", id).maybeSingle();
  if (!p || p.company_id !== companyId || p.role === "operator" || p.disabled_at) return;
  // 先に新しい主担当を立ててから、ほかの主担当を外す（途中で失敗しても主担当がいなくならないように）
  const { error } = await admin.from("profiles").update({ role: "customer_admin" }).eq("id", id);
  if (error) redirect(`/admin/${companyId}?member_error=${encodeURIComponent("主担当を替えられませんでした")}`);
  await admin.from("profiles").update({ role: "customer_member" }).eq("company_id", companyId).eq("role", "customer_admin").neq("id", id);
  revalidatePath(`/admin/${companyId}`);
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
    // 候補日は「適合診断の結果」の候補と、面談に入れたキックオフの候補の両方を見る（お客様のホーム画面と同じ数え方）
    const { loadKickoff } = await import("@/server/kickoff");
    const k = await loadKickoff(id);
    if (!k.chosen) {
      const lines = k.candidates.length
        ? ["ご入金を確認しました。ありがとうございます。", `選ばれる理由AIにサインインし、ホーム画面で、キックオフ（3時間・オンライン）の日を候補の${k.candidates.length}つからお選びください。`]
        : ["ご入金を確認しました。ありがとうございます。", "キックオフ（3時間・オンライン）の候補日は、あらためてベレネッツからご連絡します。"];
      for (const to of await customerEmails(id)) {
        await notifyCustomer({ to, subject: k.candidates.length ? "ご入金を確認しました。キックオフ日をお選びください" : "ご入金を確認しました", lines: [co?.name ?? "", "ご担当者様", "", ...lines, "", "株式会社ベレネッツ"], path: "/" });
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
  const url = safeMeetingUrl(String(formData.get("meeting_url") || "")) ?? "";
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
  // 会社はフォームの値ではなく、面談そのものの会社を使う（食い違ったフォームで別の会社の状態を進めない）
  const { data: own } = await supabase.from("company_meetings").select("company_id, kind, scheduled_at").eq("id", id).maybeSingle();
  if (!own) return;
  const companyId = own.company_id as string;
  const local = String(formData.get("scheduled_at") || "");
  const url = safeMeetingUrl(String(formData.get("meeting_url") || "")) ?? "";
  const patch: Record<string, unknown> = { meeting_url: url || null };
  if (local) patch.scheduled_at = new Date(`${local}:00+09:00`).toISOString();
  if (formData.get("held") === "1") patch.held_at = new Date().toISOString();
  if (formData.get("unheld") === "1") patch.held_at = null; // 押し間違いを戻す（記録はそのまま残る）
  await supabase.from("company_meetings").update(patch).eq("id", id);
  // キックオフの日時を動かしたら、お客様が選んだ日（診断結果の chosen_date）も新しい日時にそろえる（ホームと次の面談の表示が食い違わないように）
  if (own.kind === "kickoff" && patch.scheduled_at && new Date(patch.scheduled_at as string).getTime() !== new Date(own.scheduled_at as string).getTime()) {
    await supabase.from("diagnosis_results").update({ chosen_date: patch.scheduled_at }).eq("company_id", companyId).eq("chosen_date", own.scheduled_at as string); // 選んだ日がこの面談の日だったときだけ
  }
  // URLを入れた／実施済みにしたら「日程が選ばれました」のアラートは済み
  if (url || formData.get("held") === "1") {
    const { data: mk } = await supabase.from("company_meetings").select("kind").eq("id", id).maybeSingle();
    if (mk?.kind) await supabase.from("alerts").update({ resolved_at: new Date().toISOString() }).eq("company_id", companyId).is("resolved_at", null).contains("payload", { type: "meeting_chosen", kind: mk.kind });
  }
  if (formData.get("held") === "1") {
    const { data: m } = await supabase.from("company_meetings").select("kind").eq("id", id).maybeSingle();
    const to = m?.kind ? await advanceAfterMeeting(supabase, companyId, m.kind) : null;
    if (to) {
      revalidatePath(`/admin/${companyId}`);
      revalidatePath("/", "layout");
      redirect(`/admin/${companyId}?status_ok=${encodeURIComponent(`${MEETING_LABEL[m!.kind] ?? "面談"}を実施済にしたので、状態を「${STATUS_LABEL[to]}」に進めました。お客様側に次のステップが開きます`)}`);
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
  const { supabase, user: op } = await requireOperator();
  const companyId = String(formData.get("company_id"));
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) return;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("id").eq("company_id", companyId);
  const { data: list } = await listAllUsers(admin);
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
  // 誰が・誰宛てに発行したかを残す（リンクそのものは残さない）
  await supabase.from("activity_log").insert({ company_id: companyId, user_id: op.id, event: "admin.signin_link", payload: { to: email } });
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

/** 発行したサインインリンクを表示し終えたら、クッキーを消す（再読み込み・戻るで再表示させない） */
export async function clearIssuedLink(companyId: string) {
  await requireOperator();
  const { cookies } = await import("next/headers");
  (await cookies()).set("issued_link", "", { httpOnly: true, secure: true, sameSite: "lax", path: `/admin/${companyId}`, maxAge: 0 });
}
