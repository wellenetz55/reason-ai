"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { diagnoseRows } from "@/server/diagnose";
import { aiGuard } from "@/server/aiGuard";


/** ふわっと診断を AI に頼む（active な行、最大30組） */
export async function runVagueCheck() {
  const { supabase, company, user } = await requireCustomer();
  const [{ data: summary }, { data: rows }] = await Promise.all([
    supabase.from("company_profile_summary").select("approved_json, draft_json").eq("company_id", company.id).maybeSingle(),
    supabase.from("sheet_rows").select("id, value_raw, experience_value_v1, target").eq("company_id", company.id).eq("status", "active").order("seq").limit(30),
  ]);
  const targets = (rows ?? []).filter((r) => r.value_raw).map((r) => ({ id: r.id, value: r.value_raw as string, experience: r.experience_value_v1, target: r.target }));
  const results = await aiGuard(supabase, company.id, user.id, "vague_check.run", () => diagnoseRows({ companyName: company.name, summary: summary?.approved_json ?? summary?.draft_json ?? null, rows: targets }));
  if (!results) { revalidatePath("/sheet/merge"); return; }
  const ids = new Set(targets.map((t) => t.id));
  const upserts = results.filter((d) => ids.has(d.id)).map((d) => ({
    row_id: d.id, vague_score: Math.max(0, Math.min(3, Number(d.vague_score) || 0)), issues: (d.issues ?? []).slice(0, 3),
    suggestion_value: d.suggestion_value || null, suggestion_experience: d.suggestion_experience || null, resolved: null, checked_at: new Date().toISOString(),
  }));
  if (upserts.length) await supabase.from("row_diagnoses").upsert(upserts, { onConflict: "row_id" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "vague_check.run", payload: { n: upserts.length } });
  revalidatePath("/sheet/merge");
}

/** 言い直し案を採用する／そのままでよいとする */
export async function resolveDiagnosis(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const rowId = String(formData.get("row_id"));
  const action = String(formData.get("action")); // accept | keep
  const { data: row } = await supabase.from("sheet_rows").select("id, value_raw, experience_value_v1").eq("id", rowId).eq("company_id", company.id).maybeSingle();
  const { data: d } = await supabase.from("row_diagnoses").select("*").eq("row_id", rowId).maybeSingle();
  if (!row || !d) return;
  if (action === "accept") {
    const after = String(formData.get("after") || d.suggestion_value || "").trim();
    const afterExp = String(formData.get("after_experience") || d.suggestion_experience || row.experience_value_v1 || "").trim();
    if (!after) return;
    await supabase.from("sheet_rows").update({ value_raw: after, experience_value_v1: afterExp || null, created_by: "customer" }).eq("id", rowId);
    await supabase.from("sheet_row_reviews").insert({ row_id: rowId, column_key: "value_raw", action: "fix", before_text: row.value_raw, after_text: after, reviewer_id: user.id });
    await supabase.from("row_diagnoses").update({ resolved: "accepted", vague_score: 0 }).eq("row_id", rowId);
  } else {
    await supabase.from("row_diagnoses").update({ resolved: "kept" }).eq("row_id", rowId);
  }
  revalidatePath("/sheet/merge");
}
