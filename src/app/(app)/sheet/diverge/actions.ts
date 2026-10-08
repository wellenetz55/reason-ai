"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { draftRows, draftExperiences, FACETS, type FacetKey } from "@/server/sheet";
import { aiGuard } from "@/server/aiGuard";
import { loadProfileContext } from "@/server/profile";

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
  const experience = String(formData.get("experience") || "").trim() || null;
  if (!value) return;
  const seq = await nextSeq(supabase, company.id);
  await supabase.from("sheet_rows").insert({ company_id: company.id, seq, value_raw: value, experience_value_v1: experience, facet, round, target, created_by: "customer" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "row.add", payload: { seq, facet } });
  revalidatePath("/sheet/diverge");
}

export async function reviewRow(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const rowId = String(formData.get("row_id"));
  const action = String(formData.get("action")) as "approve" | "fix" | "hold" | "confirm" | "unconfirm";
  const after = String(formData.get("after") || "").trim();
  const afterExp = formData.has("after_experience") ? String(formData.get("after_experience") || "").trim() : null;
  const dwell = Number(formData.get("dwell_ms") || 0);
  const { data: row } = await supabase.from("sheet_rows").select("id, value_raw, experience_value_v1, status").eq("id", rowId).eq("company_id", company.id).single();
  if (!row) return;
  const update: Record<string, unknown> = {};
  if (action === "hold") { update.status = "held"; update.confirmed_at = null; }
  if (action === "approve") update.status = "active";
  if (action === "confirm") { update.status = "active"; update.confirmed_at = new Date().toISOString(); }
  if (action === "unconfirm") update.confirmed_at = null;
  if (action === "fix" && after) {
    update.value_raw = after;
    if (afterExp !== null) update.experience_value_v1 = afterExp || null;
    update.status = "active";
    update.confirmed_at = null; // 直したら確定は外れる
  }
  // approving an AI draft converts it to a customer-owned row
  if (action !== "hold") update.created_by = "customer";
  await supabase.from("sheet_rows").update(update).eq("id", rowId);
  const reviewAction = action === "confirm" ? "approve" : action === "unconfirm" ? "hold" : action;
  await supabase.from("sheet_row_reviews").insert({
    row_id: rowId, column_key: "value_raw", action: reviewAction, before_text: row.value_raw, after_text: action === "fix" ? after : row.value_raw, reviewer_id: user.id, dwell_ms: dwell || null,
  });
  if (action === "fix" && afterExp !== null && afterExp !== (row.experience_value_v1 ?? "")) {
    await supabase.from("sheet_row_reviews").insert({ row_id: rowId, column_key: "experience_value_v1", action, before_text: row.experience_value_v1, after_text: afterExp, reviewer_id: user.id });
  }
  revalidatePath("/sheet/diverge");
}

export async function requestDraft(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const facet = String(formData.get("facet") || "functional") as FacetKey;
  const round = Number(formData.get("round") || 1);
  if (!FACETS.some((f) => f.key === facet)) return;
  const [summary, { data: rows }] = await Promise.all([
    loadProfileContext(supabase, company.id),
    supabase.from("sheet_rows").select("value_raw, experience_value_v1").eq("company_id", company.id).in("status", ["active", "held"]),
  ]);
  const drafts = await aiGuard(supabase, company.id, user.id, "row.draft", () => draftRows({
    companyName: company.name,
    summary,
    facet,
    round,
    existing: (rows ?? []).map((r) => [r.value_raw, r.experience_value_v1].filter(Boolean).join(" → ")).filter(Boolean) as string[],
  }));
  if (!drafts) { revalidatePath("/sheet/diverge"); return; }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "row.draft", payload: { n: drafts.length } });
  let seq = await nextSeq(supabase, company.id);
  for (const d of drafts.slice(0, 5)) {
    if (!d.value) continue;
    await supabase.from("sheet_rows").insert({
      company_id: company.id, seq: seq++, value_raw: d.value, experience_value_v1: d.experience ?? null, target: d.target ?? null, one_liner: d.one_liner ?? null, target_tag: d.source ?? null, facet, round, created_by: "ai",
    });
  }
  revalidatePath("/sheet/diverge");
}

/** 体験価値が空の行に AI の下書きを付ける（顧客が直す／承認するまで「AIの下書き」表示） */
export async function requestExperienceDrafts() {
  const { supabase, company, user } = await requireCustomer();
  const [summary, { data: rows }] = await Promise.all([
    loadProfileContext(supabase, company.id),
    supabase.from("sheet_rows").select("id, value_raw, target").eq("company_id", company.id).eq("status", "active").or("experience_value_v1.is.null,experience_value_v1.eq.").limit(10),
  ]);
  const targets = (rows ?? []).filter((r) => r.value_raw).map((r) => ({ id: r.id, value: r.value_raw as string, target: r.target }));
  const drafts = await aiGuard(supabase, company.id, user.id, "row.draft", () => draftExperiences({ companyName: company.name, summary, rows: targets }));
  if (!drafts) { revalidatePath("/sheet/diverge"); return; }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "row.draft", payload: { n: drafts.length, kind: "experience" } });
  for (const d of drafts) {
    if (!d.experience || !targets.some((t) => t.id === d.id)) continue;
    await supabase.from("sheet_rows").update({ experience_value_v1: d.experience, target_tag: "仮説（体験価値はAI下書き）" }).eq("id", d.id).eq("company_id", company.id);
  }
  revalidatePath("/sheet/diverge");
}
