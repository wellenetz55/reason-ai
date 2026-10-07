"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { draftRows, FACETS, type FacetKey } from "@/server/sheet";

async function nextSeq(supabase: Awaited<ReturnType<typeof requireCustomer>>["supabase"], companyId: string) {
  const { data } = await supabase.from("sheet_rows").select("seq").eq("company_id", companyId).order("seq", { ascending: false }).limit(1).maybeSingle();
  return (data?.seq ?? 0) + 1;
}

export async function addRow(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const value = String(formData.get("value") || "").trim();
  const facet = String(formData.get("facet") || "functional") as FacetKey;
  const round = Number(formData.get("round") || 1);
  const target = String(formData.get("target") || "").trim() || null;
  if (!value) return;
  const seq = await nextSeq(supabase, company.id);
  await supabase.from("sheet_rows").insert({ company_id: company.id, seq, value_raw: value, facet, round, target, created_by: "customer" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "row.add", payload: { seq, facet } });
  revalidatePath("/sheet/diverge");
}

export async function reviewRow(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const rowId = String(formData.get("row_id"));
  const action = String(formData.get("action")) as "approve" | "fix" | "hold";
  const after = String(formData.get("after") || "").trim();
  const dwell = Number(formData.get("dwell_ms") || 0);
  const { data: row } = await supabase.from("sheet_rows").select("id, value_raw, status").eq("id", rowId).eq("company_id", company.id).single();
  if (!row) return;
  const update: Record<string, unknown> = {};
  if (action === "hold") update.status = "held";
  if (action === "approve") update.status = "active";
  if (action === "fix" && after) {
    update.value_raw = after;
    update.status = "active";
  }
  // approving an AI draft converts it to a customer-owned row
  if (action !== "hold") update.created_by = "customer";
  await supabase.from("sheet_rows").update(update).eq("id", rowId);
  await supabase.from("sheet_row_reviews").insert({
    row_id: rowId, column_key: "value_raw", action, before_text: row.value_raw, after_text: action === "fix" ? after : row.value_raw, reviewer_id: user.id, dwell_ms: dwell || null,
  });
  revalidatePath("/sheet/diverge");
}

export async function requestDraft(formData: FormData) {
  const { supabase, company } = await requireCustomer();
  const facet = String(formData.get("facet") || "functional") as FacetKey;
  const round = Number(formData.get("round") || 1);
  if (!FACETS.some((f) => f.key === facet)) return;
  const [{ data: summary }, { data: rows }] = await Promise.all([
    supabase.from("company_profile_summary").select("approved_json, draft_json").eq("company_id", company.id).maybeSingle(),
    supabase.from("sheet_rows").select("value_raw").eq("company_id", company.id).in("status", ["active", "held"]),
  ]);
  const drafts = await draftRows({
    companyName: company.name,
    summary: summary?.approved_json ?? summary?.draft_json ?? null,
    facet,
    round,
    existing: (rows ?? []).map((r) => r.value_raw).filter(Boolean) as string[],
  });
  let seq = await nextSeq(supabase, company.id);
  for (const d of drafts.slice(0, 5)) {
    if (!d.value) continue;
    await supabase.from("sheet_rows").insert({
      company_id: company.id, seq: seq++, value_raw: d.value, target: d.target ?? null, one_liner: d.one_liner ?? null, target_tag: d.source ?? null, facet, round, created_by: "ai",
    });
  }
  revalidatePath("/sheet/diverge");
}
