import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  company_id: string | null;
  role: "customer_admin" | "customer_member" | "operator";
  display_name: string | null;
  title: string | null;
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
  extension_until: string | null;
  generation_quota_month: number;
  generation_quota_grace: number;
};

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login?error=" + encodeURIComponent("アカウント設定が完了していません。ベレネッツにお問い合わせください。"));
  return { supabase, user, profile: profile as Profile };
}

export async function requireCustomer() {
  const ctx = await requireUser();
  if (ctx.profile.role === "operator") redirect("/admin");
  if (!ctx.profile.company_id) redirect("/login?error=" + encodeURIComponent("会社が紐づいていません。"));
  const { data: company } = await ctx.supabase.from("companies").select("*").eq("id", ctx.profile.company_id).single();
  return { ...ctx, company: company as Company };
}

export async function requireOperator() {
  const ctx = await requireUser();
  if (ctx.profile.role !== "operator") redirect("/");
  return ctx;
}
