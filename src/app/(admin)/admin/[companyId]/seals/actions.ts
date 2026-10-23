"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/session";
import { SEAL_SESSIONS } from "@/lib/seals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (companyId: string, q: string) => redirect(`/admin/${companyId}/seals?${q}`);

/** 確認セッションの「封をする」。同じ確認セッションの封がすでにあれば、いまの時点で封をし直す（封より前にあった行が対象になる） */
export async function sealSession(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = String(formData.get("company_id") ?? "");
  const key = String(formData.get("session") ?? "");
  const def = SEAL_SESSIONS.find((s) => s.key === key);
  if (!UUID.test(companyId) || !def) return;
  // 仮封：封をする列のうち、根拠の印が「事実」でない主張が残っているか
  let provisional = false;
  if (key !== "s1") {
    const [{ count: rowsHyp }, { count: brakesHyp }] = await Promise.all([
      supabase.from("sheet_rows").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active").not("because_phrase", "is", null).neq("because_tag", "fact"),
      supabase.from("brakes").select("id, sheet_rows!inner(company_id, status)", { count: "exact", head: true }).eq("sheet_rows.company_id", companyId).eq("sheet_rows.status", "active").eq("status", "active").not("counter_message", "is", null).neq("because_tag", "fact"),
    ]);
    provisional = (rowsHyp ?? 0) + (brakesHyp ?? 0) > 0;
  }
  // 封をし直すときは、同じ封を更新する（消して作り直すと、変更の記録まで消えるため）
  const rec = { columns: [...def.columns], is_provisional: provisional, locked_by: user.id, locked_at: new Date().toISOString() };
  const { data: ex } = await supabase.from("sheet_locks").select("id").eq("company_id", companyId).eq("session", key).order("locked_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = ex
    ? await supabase.from("sheet_locks").update(rec).eq("id", ex.id)
    : await supabase.from("sheet_locks").insert({ company_id: companyId, session: key, ...rec });
  if (error) return back(companyId, "error=" + encodeURIComponent(`封をできませんでした：${error.message}`));
  await supabase.from("activity_log").insert({ company_id: companyId, user_id: user.id, event: "admin.seal", payload: { session: key, provisional } });
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/", "layout");
  back(companyId, "notice=" + encodeURIComponent(`${def.label}の封をしました${provisional ? "（仮封：根拠が「事実」でない主張は、お客様が理由なしで直せます）" : ""}`));
}

/** 封を解く（間違えて封をしたとき）。その封についた変更の記録も一緒に消える */
export async function unsealSession(formData: FormData) {
  const { supabase, user } = await requireOperator();
  const companyId = String(formData.get("company_id") ?? "");
  const key = String(formData.get("session") ?? "");
  if (!UUID.test(companyId) || !SEAL_SESSIONS.some((s) => s.key === key)) return;
  await supabase.from("sheet_locks").delete().eq("company_id", companyId).eq("session", key);
  await supabase.from("activity_log").insert({ company_id: companyId, user_id: user.id, event: "admin.unseal", payload: { session: key } });
  revalidatePath(`/admin/${companyId}`);
  revalidatePath("/", "layout");
  back(companyId, "notice=" + encodeURIComponent("封を解きました"));
}
