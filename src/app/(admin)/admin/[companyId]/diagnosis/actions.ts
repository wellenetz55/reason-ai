"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

const jst = (local: string) => (local ? new Date(`${local}:00+09:00`).toISOString() : null);
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
/** 顧客側で自動で付く前置き・カギ括弧を、入力から取り除く（二重表示を防ぐ） */
const strip = (v: string, prefixes: string[]) => {
  let t = v.trim();
  for (const p of prefixes) if (t.startsWith(p)) t = t.slice(p.length).replace(/^[、,\s]+/, "");
  return t.replace(/^[「『"]+/, "").replace(/[」』"]+$/, "").trim();
};

/** 診断結果を保存（公開はしない） */
export async function saveDiagnosis(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = s(formData, "company_id");
  const dropped: string[] = [];
  const seeds = [1, 2, 3].map((i) => ({ feature: strip(s(formData, `seed${i}_feature`), ["御社は"]), experience: strip(s(formData, `seed${i}_experience`), ["だから、お客様は", "だから お客様は", "だから"]), tag: s(formData, `seed${i}_tag`) || "hypothesis" })).filter((x, i) => {
    if (!x.feature && x.experience) dropped.push(`芽${i + 1}（「〜できる」が空）`);
    return x.feature;
  });
  const brakes = [1, 2].map((i) => ({ kind: s(formData, `brake${i}_kind`), words: strip(s(formData, `brake${i}_words`), []) })).filter((x) => x.words);
  const fit = [1, 2, 3].map((i) => ({ condition: s(formData, `fit${i}_condition`), quote: s(formData, `fit${i}_quote`) })).filter((x, i) => {
    if (!x.condition && x.quote) dropped.push(`適合理由${i + 1}（条件が未選択）`);
    return x.condition;
  });
  const claims = [1, 2, 3].map((i) => s(formData, `comp_claim${i}`)).filter(Boolean);
  const compName = s(formData, "comp_name");
  if (!compName && claims.length) dropped.push("競合の訴求（競合名が空）");
  if (compName && !claims.length) dropped.push("競合（訴求が空のため顧客側には出ません）");
  const competitor = compName && claims.length ? { name: compName, claims } : null;
  const dates = [1, 2, 3].map((i) => jst(s(formData, `date${i}`))).filter(Boolean);
  const expiresLocal = s(formData, "expires_at");
  await supabase.from("diagnosis_results").upsert({
    company_id: companyId,
    one_liner_before: s(formData, "one_liner_before") || null,
    seeds, brakes, fit_reasons: fit, competitor, candidate_dates: dates,
    operator_note: s(formData, "operator_note") || null,
    expires_at: expiresLocal ? jst(expiresLocal) : null,
    created_by: user.id,
    updated_at: new Date().toISOString(),
  });
  // 面談で聞いた「一言」は Q1 before としても固定（空にしたら消す）
  await supabase.from("company_profile_summary").upsert({ company_id: companyId, q1_before: s(formData, "one_liner_before") || null, updated_at: new Date().toISOString() });
  revalidatePath(`/admin/${companyId}/diagnosis`);
  if (dropped.length) redirect(`/admin/${companyId}/diagnosis?error=${encodeURIComponent(`保存しましたが、次の入力は使われていません：${dropped.join("／")}`)}`);
  redirect(`/admin/${companyId}/diagnosis?notice=${encodeURIComponent("保存しました")}`);
}

/** 担当者を招待（アカウント作成＋マジックリンク送付）して、診断結果を公開する */
export async function publishDiagnosis(formData: FormData) {
  const { supabase } = await requireOperator();
  const companyId = s(formData, "company_id");
  const email = s(formData, "email").toLowerCase();
  const name = s(formData, "display_name");
  const admin = createAdminClient();
  const back = (msg: string) => redirect(`/admin/${companyId}/diagnosis?error=${encodeURIComponent(msg)}`);
  if (email) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      // 既存ユーザー：運営者・他社の担当者は登録しない。役割と名前は変えない（名前は入力があるときだけ）
      const { data: prof } = await admin.from("profiles").select("role, company_id, display_name").eq("id", existing.id).maybeSingle();
      if (prof?.role === "operator") back("そのメールアドレスは運営者です。顧客の担当者には登録できません");
      if (prof?.company_id && prof.company_id !== companyId) back("そのメールアドレスは別の会社の担当者として登録済みです");
      await admin.from("profiles").upsert({ id: existing.id, company_id: companyId, role: prof?.role ?? "customer_admin", display_name: name || prof?.display_name || email });
      await admin.auth.signInWithOtp({ email, options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`, shouldCreateUser: false } });
    } else {
      const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` });
      if (error || !invited?.user) back(`招待できませんでした（${error?.message ?? "不明なエラー"}）`);
      await admin.from("profiles").upsert({ id: invited!.user!.id, company_id: companyId, role: "customer_admin", display_name: name || email });
    }
  }
  await supabase.from("diagnosis_results").update({ published_at: new Date().toISOString() }).eq("company_id", companyId);
  revalidatePath(`/admin/${companyId}/diagnosis`);
  revalidatePath(`/admin/${companyId}`);
}
