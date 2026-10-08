"use server";
import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

const jst = (local: string) => (local ? new Date(`${local}:00+09:00`).toISOString() : null);
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** 診断結果を保存（公開はしない） */
export async function saveDiagnosis(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = s(formData, "company_id");
  const seeds = [1, 2, 3].map((i) => ({ feature: s(formData, `seed${i}_feature`), experience: s(formData, `seed${i}_experience`), tag: s(formData, `seed${i}_tag`) || "hypothesis" })).filter((x) => x.feature);
  const brakes = [1, 2].map((i) => ({ kind: s(formData, `brake${i}_kind`), words: s(formData, `brake${i}_words`) })).filter((x) => x.words);
  const fit = [1, 2, 3].map((i) => ({ condition: s(formData, `fit${i}_condition`), quote: s(formData, `fit${i}_quote`) })).filter((x) => x.condition);
  const claims = [1, 2, 3].map((i) => s(formData, `comp_claim${i}`)).filter(Boolean);
  const competitor = s(formData, "comp_name") ? { name: s(formData, "comp_name"), claims } : null;
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
  // 面談で聞いた「一言」は Q1 before としても固定
  if (s(formData, "one_liner_before")) {
    await supabase.from("company_profile_summary").upsert({ company_id: companyId, q1_before: s(formData, "one_liner_before"), updated_at: new Date().toISOString() });
  }
  revalidatePath(`/admin/${companyId}/diagnosis`);
}

/** 担当者を招待（アカウント作成＋マジックリンク送付）して、診断結果を公開する */
export async function publishDiagnosis(formData: FormData) {
  const { supabase } = await requireOperator();
  const companyId = s(formData, "company_id");
  const email = s(formData, "email").toLowerCase();
  const name = s(formData, "display_name");
  const admin = createAdminClient();
  if (email) {
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` });
    let uid = invited?.user?.id;
    if (error) {
      // 既存ユーザーならマジックリンクを送る
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      uid = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
      if (uid) await admin.auth.signInWithOtp({ email, options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`, shouldCreateUser: false } });
    }
    if (uid) await admin.from("profiles").upsert({ id: uid, company_id: companyId, role: "customer_admin", display_name: name || email });
  }
  await supabase.from("diagnosis_results").update({ published_at: new Date().toISOString() }).eq("company_id", companyId);
  revalidatePath(`/admin/${companyId}/diagnosis`);
  revalidatePath(`/admin/${companyId}`);
}
