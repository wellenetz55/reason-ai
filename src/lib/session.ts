import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginErrorUrl } from "@/lib/loginErrors";

export type Profile = {
  id: string;
  company_id: string | null;
  role: "customer_admin" | "customer_member" | "operator";
  display_name: string | null;
  title: string | null;
  /** ベレネッツ側のスーパー管理者（migration 0017） */
  is_super_admin?: boolean;
  /** 削除したメンバー（migration 0017） */
  disabled_at?: string | null;
};

export type Company = {
  id: string;
  name: string;
  status: string;
  session1_at: string | null;
  midcheck_at: string | null;
  session2_at: string | null;
  session3_at: string | null;
  grace_until: string | null;
  applied_at: string | null;
  contracted_at: string | null;
  paid_at: string | null;
  extension_until: string | null;
  generation_quota_month: number;
  generation_quota_grace: number;
  /** 解約後、ベレネッツが一時的にデータを見られるようにした期限（migration 0016） */
  reaccess_until?: string | null;
  /** 解約後の一時再アクセス中（requireCustomer が付ける。DBの列ではない） */
  reaccess?: boolean;
};

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect(loginErrorUrl("noprofile"));
  if (profile.disabled_at) {
    await supabase.auth.signOut();
    redirect(loginErrorUrl("disabled"));
  }
  return { supabase, user, profile: profile as Profile };
}

export async function requireCustomer() {
  const ctx = await requireUser();
  if (ctx.profile.role === "operator") redirect("/admin");
  if (!ctx.profile.company_id) redirect(loginErrorUrl("nocompany"));
  const { data } = await ctx.supabase.from("companies").select("*").eq("id", ctx.profile.company_id).maybeSingle();
  // 解約した会社は、ベレネッツが再アクセスを許可するまで何も読めない（SQL 0047。会社の行も見えなくなる）。
  // 読めなかったときは、解約かどうかをサーバ側で確かめ、解約なら「閲覧の再開を依頼する」画面へ
  if (!data) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data: c } = await createAdminClient().from("companies").select("status, reaccess_until").eq("id", ctx.profile.company_id).maybeSingle();
    if (c?.status === "cancelled") redirect("/closed");
    redirect(loginErrorUrl("nocompany"));
  }
  let company = data as Company;
  if (company.status === "cancelled") {
    // 再アクセスの期間は「閲覧のみ」（猶予期間と同じ扱い：シートを見られ、Excelをダウンロードできる。書き込みはできない）
    if (company.reaccess_until && new Date(company.reaccess_until) > new Date()) company = { ...company, status: "grace", grace_until: company.reaccess_until, reaccess: true };
    else redirect("/closed"); // SQL 0047 を実行する前でも、画面は閉じる
  }
  return { ...ctx, company };
}

/** 契約前・猶予期間・編集終了・解約の会社は書き込めない（画面でフォームを隠すだけでなく、サーバ側でも止める） */
const READ_ONLY = new Set(["diagnosed", "grace", "locked", "cancelled"]); // grace：確認セッション③のあと1か月は閲覧・Excelダウンロードのみ（仕様 00）
export async function requireWritableCustomer() {
  const ctx = await requireCustomer();
  if (READ_ONLY.has(ctx.company.status)) redirect("/");
  return ctx;
}

export async function requireOperator() {
  const ctx = await requireUser();
  if (ctx.profile.role !== "operator") redirect("/");
  return { ...ctx, isSuper: !!ctx.profile.is_super_admin };
}

/** スーパー管理者だけが使える操作（メンバーの追加・削除・権限変更） */
export async function requireSuperAdmin() {
  const ctx = await requireOperator();
  if (!ctx.isSuper) redirect("/admin/members?error=" + encodeURIComponent("この操作はスーパー管理者だけができます"));
  return ctx;
}

/**
 * 担当者以外のメンバー（customer_member）か。仕様 00：メンバーは書き出し・修正・AIへの依頼はできるが、承認・確定・決定はできない。
 * メンバーの修正は「承認待ち」の状態で保存し、承認・決定・面談日程の選択・申し込みは担当者（customer_admin）だけが行う。
 */
export const isMember = (profile: { role: string }) => profile.role === "customer_member";
