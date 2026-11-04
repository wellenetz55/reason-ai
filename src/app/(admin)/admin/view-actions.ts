"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireOperator, VIEW_COOKIE } from "@/lib/session";

/** お客様の画面を、ベレネッツが読み取り専用で見る（面談中に同じ画面を見ながら話すため）。cookie に会社idを入れて / へ */
export async function startView(formData: FormData) {
  await requireOperator();
  const id = String(formData.get("company_id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/admin");
  (await cookies()).set(VIEW_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
  redirect("/");
}

/** 閲覧モードを終えて管理画面へ戻る */
export async function exitView() {
  await requireOperator();
  const jar = await cookies();
  const id = jar.get(VIEW_COOKIE)?.value;
  jar.delete(VIEW_COOKIE);
  redirect(id && /^[0-9a-f-]{36}$/.test(id) ? `/admin/${id}` : "/admin");
}
