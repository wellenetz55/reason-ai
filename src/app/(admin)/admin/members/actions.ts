"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator, requireSuperAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

const APP = () => process.env.NEXT_PUBLIC_APP_URL;
const back = (q: string): never => redirect(`/admin/members?${q}`);

/** ベレネッツのメンバーを追加（スーパー管理者のみ）。招待メール（マジックリンク）が届く */
export async function inviteOperator(formData: FormData) {
  await requireSuperAdmin();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("display_name") || "").trim();
  const isSuper = formData.get("role") === "super";
  if (!email || !name) back(`error=${encodeURIComponent("お名前とメールアドレスを入れてください")}`);
  const admin = createAdminClient();
  const { data: list0 } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const ex = list0?.users.find((u) => u.email?.toLowerCase() === email);
  if (ex) {
    const { data: p } = await admin.from("profiles").select("*").eq("id", ex.id).maybeSingle();
    // 既に顧客の担当者として登録されている人は、運営者にしない
    if (p && p.role !== "operator") back(`error=${encodeURIComponent("そのメールアドレスは顧客の担当者として登録済みです。ベレネッツのメンバーには追加できません")}`);
    // 有効なメンバーをもう一度「追加」しても権限は変えない（スーパー管理者が0人になるのを防ぐ）。権限は一覧の「〜にする」で変える
    if (p && p.role === "operator" && !p.disabled_at) back(`error=${encodeURIComponent("そのメールアドレスはすでにメンバーです。権限は一覧から変えてください")}`);
  }
  let uid = ex?.id;
  if (!ex) {
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${APP()}/auth/callback` });
    if (error || !invited?.user) back(`error=${encodeURIComponent("招待できませんでした：" + (error?.message ?? ""))}`);
    uid = invited!.user!.id;
  } else {
    // 以前に削除したメンバーを戻す場合は、サインインの停止を解く
    await admin.auth.admin.updateUserById(ex.id, { ban_duration: "none" });
    await admin.auth.signInWithOtp({ email, options: { emailRedirectTo: `${APP()}/auth/callback`, shouldCreateUser: false } });
  }
  const { error: pe } = await admin.from("profiles").upsert({ id: uid!, company_id: null, role: "operator", display_name: name, is_super_admin: isSuper, disabled_at: null });
  if (pe) back(`error=${encodeURIComponent("保存できませんでした（SQL 0017 が未実行の可能性があります）：" + pe.message)}`);
  revalidatePath("/admin/members");
  back("ok=invited");
}

/** 招待メールを再送（管理者なら誰でも） */
export async function resendInvite(formData: FormData) {
  await requireOperator();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) return;
  await createAdminClient().auth.signInWithOtp({ email, options: { emailRedirectTo: `${APP()}/auth/callback`, shouldCreateUser: false } });
  back("ok=resent");
}

/** 有効なスーパー管理者の人数 */
async function superCount() {
  const { data } = await createAdminClient().from("profiles").select("id, is_super_admin, disabled_at").eq("role", "operator");
  return (data ?? []).filter((p) => p.is_super_admin && !p.disabled_at).length;
}

/** メンバーを削除（スーパー管理者のみ）。履歴（回答・面談の記録）を残すため行は消さず、サインインを止める */
export async function removeOperator(formData: FormData) {
  const { user } = await requireSuperAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  if (id === user.id) back(`error=${encodeURIComponent("自分自身は削除できません")}`);
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("role, is_super_admin").eq("id", id).maybeSingle();
  if (p?.role !== "operator") return;
  await admin.from("profiles").update({ disabled_at: new Date().toISOString(), is_super_admin: false }).eq("id", id);
  // 約100年サインインを止める（あとで「追加」し直せば戻せる）
  await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
  revalidatePath("/admin/members");
  back("ok=removed");
}

/** 権限を変える（スーパー管理者のみ）。スーパー管理者が0人にはならないようにする */
export async function setOperatorRole(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id") || "");
  const toSuper = formData.get("role") === "super";
  if (!id) return;
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("role, is_super_admin, disabled_at").eq("id", id).maybeSingle();
  if (p?.role !== "operator" || p.disabled_at) return;
  if (!toSuper && p.is_super_admin && (await superCount()) <= 1) back(`error=${encodeURIComponent("スーパー管理者が1人もいなくなるため、変更できません")}`);
  await admin.from("profiles").update({ is_super_admin: toSuper }).eq("id", id);
  revalidatePath("/admin/members");
  back("ok=role");
}

/** 今すぐ Dropbox に保存（スーパー管理者のみ） */
export async function backupNow() {
  await requireSuperAdmin();
  const { backupToDropbox } = await import("@/server/dropbox");
  const r = await backupToDropbox("manual");
  revalidatePath("/admin/members");
  redirect(r.ok ? "/admin/members?ok=backup#backup" : `/admin/members?error=${encodeURIComponent("Dropbox に保存できませんでした：" + (r.error ?? ""))}#backup`);
}

/** Dropbox との接続を切る（スーパー管理者のみ）。Dropbox 側のファイルは消さない */
export async function disconnectDropbox() {
  await requireSuperAdmin();
  const { deleteSetting } = await import("@/server/dropbox");
  await deleteSetting("dropbox");
  revalidatePath("/admin/members");
  redirect("/admin/members?ok=dropbox_off#backup");
}
