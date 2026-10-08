"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/session";
import { draftBecause } from "@/server/because";
import { PROFILE_ITEMS } from "@/lib/profileItems";

/** なぜならが空の行（最大10）に AI の下書きを付ける */
export async function requestBecauseDrafts() {
  const { supabase, company, user } = await requireCustomer();
  const [{ data: items }, { data: rows }] = await Promise.all([
    supabase.from("profile_items").select("key, value, status").eq("company_id", company.id).in("status", ["approved", "fixed"]),
    supabase.from("sheet_rows").select("id, value_raw, experience_value, experience_value_v1").eq("company_id", company.id).eq("status", "active").or("because_phrase.is.null,because_phrase.eq.").order("seq").limit(10),
  ]);
  const profile: Record<string, string> = {};
  for (const it of items ?? []) { const def = PROFILE_ITEMS.find((d) => d.key === it.key); if (def && it.value) profile[def.label] = it.value; }
  const targets = (rows ?? []).filter((r) => r.value_raw).map((r) => ({ id: r.id, value: r.value_raw as string, experience: r.experience_value ?? r.experience_value_v1 }));
  const drafts = await draftBecause({ companyName: company.name, profile, rows: targets });
  for (const d of drafts) {
    if (!targets.some((t) => t.id === d.id)) continue;
    const patch: Record<string, unknown> = { because_phrase: d.because, because_tag: d.tag ?? "hypothesis", because_only_us: !!d.only_us, because_by: "ai", trust_axis: d.type ?? null };
    if (d.experience) patch.experience_value = d.experience;
    await supabase.from("sheet_rows").update(patch).eq("id", d.id).eq("company_id", company.id);
  }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "because.draft", payload: { n: drafts.length } });
  revalidatePath("/sheet/trust");
}

/** 三連を直す／承認する */
export async function saveTriple(formData: FormData) {
  const { supabase, company, user } = await requireCustomer();
  const rowId = String(formData.get("row_id"));
  const action = String(formData.get("action")); // fix | approve
  const { data: row } = await supabase.from("sheet_rows").select("id, experience_value, experience_value_v1, because_phrase").eq("id", rowId).eq("company_id", company.id).maybeSingle();
  if (!row) return;
  const patch: Record<string, unknown> = { because_by: "customer" };
  if (action === "fix") {
    const exp = String(formData.get("experience") || "").trim();
    const because = String(formData.get("because") || "").trim();
    const tag = String(formData.get("tag") || "hypothesis");
    patch.experience_value = exp || null;
    patch.because_phrase = because || null;
    patch.because_tag = ["fact", "verify", "hypothesis"].includes(tag) ? tag : "hypothesis";
    patch.because_only_us = formData.get("only_us") === "1";
    patch.trust_axis = String(formData.get("type") || "") || null;
    await supabase.from("sheet_row_reviews").insert({ row_id: rowId, column_key: "because_phrase", action: "fix", before_text: row.because_phrase, after_text: because, reviewer_id: user.id });
  } else {
    if (!row.experience_value) patch.experience_value = row.experience_value_v1;
    await supabase.from("sheet_row_reviews").insert({ row_id: rowId, column_key: "because_phrase", action: "approve", before_text: row.because_phrase, after_text: row.because_phrase, reviewer_id: user.id });
  }
  await supabase.from("sheet_rows").update(patch).eq("id", rowId);
  revalidatePath("/sheet/trust");
}
