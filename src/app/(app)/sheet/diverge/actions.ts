"use server";
import { MAX, cut, nl } from "@/lib/limits";
import { revalidatePath } from "next/cache";
import { requireStage } from "@/server/stageGuard";
import { draftRows, draftExperiences, FACETS, type FacetKey } from "@/server/sheet";
import { aiGuard } from "@/server/aiGuard";
import { loadProfileContext } from "@/server/profile";

type Sb = Awaited<ReturnType<typeof requireStage>>["supabase"];
async function nextSeq(supabase: Sb, companyId: string) {
  const { data } = await supabase.from("sheet_rows").select("seq").eq("company_id", companyId).order("seq", { ascending: false }).limit(1).maybeSingle();
  return (data?.seq ?? 0) + 1;
}

/**
 * 番号（seq）をつけて1行追加する。同時に追加されて番号がぶつかったら（unique違反 23505）、番号を取り直して入れ直す。
 * 黙って1行消える、を起こさない。
 */
async function insertRow(supabase: Sb, companyId: string, row: Record<string, unknown>): Promise<number | null> {
  for (let i = 0; i < 5; i++) {
    const seq = await nextSeq(supabase, companyId);
    const { error } = await supabase.from("sheet_rows").insert({ ...row, company_id: companyId, seq });
    if (!error) return seq;
    if (error.code !== "23505") return null;
  }
  return null;
}

export async function addRow(formData: FormData) {
  const { supabase, company, user } = await requireStage("diverge");
  const value = cut(String(formData.get("value") || "").trim(), MAX.value);
  const facetIn = String(formData.get("facet") || "functional");
  const facet = (FACETS.some((f) => f.key === facetIn) ? facetIn : "functional") as FacetKey;
  const r0 = Math.trunc(Number(formData.get("round"))); const round = r0 >= 1 && r0 <= 20 ? r0 : 1;
  const target = cut(String(formData.get("target") || "").trim(), MAX.target) || null;
  const experience = cut(String(formData.get("experience") || "").trim(), MAX.value) || null;
  if (!value) return;
  const seq = await insertRow(supabase, company.id, { value_raw: value, experience_value_v1: experience, facet, round, target, created_by: "customer" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "row.add", payload: { seq, facet } });
  revalidatePath("/sheet/diverge");
}

export async function reviewRow(formData: FormData) {
  const { supabase, company, user } = await requireStage("diverge");
  const rowId = String(formData.get("row_id"));
  const action = String(formData.get("action")) as "approve" | "fix" | "hold" | "confirm" | "unconfirm";
  const after = cut(String(formData.get("after") || "").trim(), MAX.value);
  const afterExp = formData.has("after_experience") ? cut(String(formData.get("after_experience") || "").trim(), MAX.value) : null;
  const dwell = Number(formData.get("dwell_ms") || 0);
  const { data: row } = await supabase.from("sheet_rows").select("id, value_raw, experience_value_v1, status").eq("id", rowId).eq("company_id", company.id).single();
  if (!row) return;
  // 提供価値を空にして「直して確定」を押したときは何もしない（AIの下書きが承認なしで御社の行になってしまうため）
  if (action === "fix" && !after) { revalidatePath("/sheet/diverge"); return; }
  const update: Record<string, unknown> = {};
  if (action === "hold") { update.status = "held"; update.confirmed_at = null; }
  if (action === "approve") update.status = "active";
  if (action === "confirm") { update.status = "active"; update.confirmed_at = new Date().toISOString(); }
  if (action === "unconfirm") update.confirmed_at = null;
  if (action === "fix" && after) {
    update.value_raw = after;
    // STEP 1 で体験価値を直したら、STEP 5 で表示する体験価値も同じにそろえる
    // 体験価値を実際に書き換えたときだけ、STEP 5 で表示する体験価値もそろえる（提供価値だけ直したときは STEP 5 の文を残す）
    if (afterExp !== null && afterExp !== nl(row.experience_value_v1)) { update.experience_value_v1 = afterExp || null; update.experience_value = afterExp || null; }
    update.status = "active";
    update.confirmed_at = new Date().toISOString(); // ボタンは「直して確定」：直した文で確定する
  }
  // approving an AI draft converts it to a customer-owned row
  if (action !== "hold") update.created_by = "customer";
  await supabase.from("sheet_rows").update(update).eq("id", rowId);
  // 保留・却下から STEP 1 で戻した組は、STEP 2 のレビューでも「未決」に戻す（決めたまま操作ボタンが出ない行を作らない）
  if (update.status === "active" && (row.status === "held" || row.status === "dropped")) {
    await supabase.from("row_diagnoses").update({ resolved: null }).eq("row_id", rowId).in("resolved", ["held", "dropped"]);
    revalidatePath("/sheet/merge");
  }
  const reviewAction = action === "confirm" ? "approve" : action === "unconfirm" ? "hold" : action;
  await supabase.from("sheet_row_reviews").insert({
    row_id: rowId, column_key: "value_raw", action: reviewAction, before_text: row.value_raw, after_text: action === "fix" ? after : row.value_raw, reviewer_id: user.id, dwell_ms: dwell || null,
  });
  if (action === "fix" && afterExp !== null && afterExp !== nl(row.experience_value_v1)) {
    await supabase.from("sheet_row_reviews").insert({ row_id: rowId, column_key: "experience_value_v1", action, before_text: row.experience_value_v1, after_text: afterExp, reviewer_id: user.id });
  }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "row.review" });
  revalidatePath("/sheet/diverge");
}

export async function requestDraft(formData: FormData) {
  const { supabase, company, user } = await requireStage("diverge");
  const facetIn = String(formData.get("facet") || "functional");
  const facet = (FACETS.some((f) => f.key === facetIn) ? facetIn : "functional") as FacetKey;
  const r0 = Math.trunc(Number(formData.get("round"))); const round = r0 >= 1 && r0 <= 20 ? r0 : 1;
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
  for (const d of drafts.slice(0, 5)) {
    if (!d.value) continue;
    await insertRow(supabase, company.id, {
      value_raw: d.value, experience_value_v1: d.experience ?? null, target: d.target ?? null, one_liner: d.one_liner ?? null, target_tag: d.source ?? null, facet, round, created_by: "ai",
    });
  }
  revalidatePath("/sheet/diverge");
}

/** 体験価値が空の行に AI の下書きを付ける（顧客が直す／承認するまで「AIの下書き」表示） */
export async function requestExperienceDrafts() {
  const { supabase, company, user } = await requireStage("diverge");
  const [summary, { data: rows }] = await Promise.all([
    loadProfileContext(supabase, company.id),
    supabase.from("sheet_rows").select("id, value_raw, target").eq("company_id", company.id).eq("status", "active").or("experience_value_v1.is.null,experience_value_v1.eq.").limit(10),
  ]);
  const targets = (rows ?? []).filter((r) => r.value_raw).map((r) => ({ id: r.id, value: r.value_raw as string, target: r.target }));
  // 対象が無ければAIを呼ばない（呼び出し回数の上限を無駄に使わない）
  if (!targets.length) { revalidatePath("/sheet/diverge"); return; }
  const drafts = await aiGuard(supabase, company.id, user.id, "row.draft", () => draftExperiences({ companyName: company.name, summary, rows: targets }));
  if (!drafts) { revalidatePath("/sheet/diverge"); return; }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "row.draft", payload: { n: drafts.length, kind: "experience" } });
  for (const d of drafts) {
    if (!d.experience || !targets.some((t) => t.id === d.id)) continue;
    // AIを待つ間にお客様が体験価値を書いていたら上書きしない
    await supabase.from("sheet_rows").update({ experience_value_v1: d.experience, target_tag: "仮説（体験価値はAI下書き）" }).eq("id", d.id).eq("company_id", company.id).or("experience_value_v1.is.null,experience_value_v1.eq.");
  }
  revalidatePath("/sheet/diverge");
}
