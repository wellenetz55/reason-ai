"use server";
import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

const APP = () => process.env.NEXT_PUBLIC_APP_URL;

/** ベレネッツのメンバーを招待（operator）。招待メール（マジックリンク）が届く */
export async function inviteOperator(formData: FormData) {
  await requireOperator();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("display_name") || "").trim();
  if (!email || !name) return;
  const admin = createAdminClient();
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${APP()}/auth/callback` });
  let uid = invited?.user?.id;
  if (error) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    uid = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (uid) await admin.auth.signInWithOtp({ email, options: { emailRedirectTo: `${APP()}/auth/callback`, shouldCreateUser: false } });
  }
  if (uid) await admin.from("profiles").upsert({ id: uid, company_id: null, role: "operator", display_name: name });
  revalidatePath("/admin/members");
}

/** 招待メールを再送 */
export async function resendInvite(formData: FormData) {
  await requireOperator();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) return;
  await createAdminClient().auth.signInWithOtp({ email, options: { emailRedirectTo: `${APP()}/auth/callback`, shouldCreateUser: false } });
}

/** メンバーを外す（自分自身は外せない。auth ユーザーは残し、ロールを顧客にせずアカウント削除） */
export async function removeOperator(formData: FormData) {
  const { user } = await requireOperator();
  const id = String(formData.get("id") || "");
  if (!id || id === user.id) return;
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("role").eq("id", id).maybeSingle();
  if (p?.role !== "operator") return;
  await admin.auth.admin.deleteUser(id); // profiles は cascade で消える
  revalidatePath("/admin/members");
}
