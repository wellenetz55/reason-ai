"use server";
import { MAX, cut } from "@/lib/limits";
import { revalidatePath } from "next/cache";
import { requireStage } from "@/server/stageGuard";
import { diagnoseRows } from "@/server/diagnose";
import { aiGuard } from "@/server/aiGuard";
import { loadProfileContext } from "@/server/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOperators } from "@/server/notify";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 「まとめて絞る」が一通り終わった（レビュー済みで未対応の組が0）なら、ベレネッツに
 * 「確認セッション①の日程を決める番」のアラートを1回だけ出す。顧客側からベレネッツにボールが渡る合図。
 */
async function notifyStep2Done(supabase: SupabaseClient, companyId: string, companyName: string, status: string, userId: string) {
  if (status !== "week1_2") return;
  const [{ data: rows }, { data: diags }] = await Promise.all([
    supabase.from("sheet_rows").select("id").eq("company_id", companyId).eq("status", "active"),
    supabase.from("row_diagnoses").select("row_id, vague_score, resolved, checked_at, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId),
  ]);
  const ids = new Set((rows ?? []).map((r) => r.id));
  const list = (diags ?? []).filter((d) => ids.has(d.row_id));
  // 残っている組がすべてレビュー済みで、未対応が0のときだけ（31組目以降が未レビューのまま通知しない）
  if (list.length === 0 || list.length < ids.size) return;
  const open = list.filter((d) => d.resolved == null && d.vague_score >= 1).length;
  if (open > 0) return;
  const admin = createAdminClient();
  // 確認セッション①がもう登録されていれば、ボールはすでにベレネッツが受け取っている（見直しのたびに通知し直さない）
  const { count: s1 } = await admin.from("company_meetings").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("kind", "session1");
  if ((s1 ?? 0) > 0) return;
  const { data: existing } = await admin.from("alerts").select("id").eq("company_id", companyId).is("resolved_at", null).contains("payload", { type: "step2_done" }).limit(1).maybeSingle();
  if (existing) return;
  await admin.from("alerts").insert({ company_id: companyId, kind: "escalation", payload: { type: "step2_done", by: userId } });
  await notifyOperators({ subject: `${companyName} が「まとめて絞る」を終えました（確認セッション①の日程を）`, lines: [`${companyName} の担当者が STEP 2「まとめて絞る」のレビューを終え、すべての組を決めました。`, "次はベレネッツの番です。確認セッション①の日程を決め、管理画面の面談に登録してください（登録すると顧客画面に日程が出ます）。"], path: `/admin/${companyId}` });
}


/** ふわっと診断を AI に頼む（active な行、最大30組） */
export async function runVagueCheck() {
  const { supabase, company, user } = await requireStage("merge");
  const [summary, { data: rows }, { data: prevDiags }] = await Promise.all([
    loadProfileContext(supabase, company.id),
    supabase.from("sheet_rows").select("id, value_raw, experience_value_v1, target").eq("company_id", company.id).eq("status", "active").order("seq"),
    supabase.from("row_diagnoses").select("row_id, vague_score, suggestion_value, resolved, redraft_history, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id),
  ]);
  // すでに決めた組（決定・初期案のまま・保留）と、AIが「このままで通用する」と判断済みの組はもう一度レビューしない。
  // まだ一度もレビューしていない組を先に回す（組が30を超えても、全組が必ず一度はレビューされる）
  const prevBy = new Map((prevDiags ?? []).map((d) => [d.row_id as string, d]));
  const aiOk = (id: string) => { const p = prevBy.get(id); return !!p && p.resolved == null && Number(p.vague_score) === 0 && !p.suggestion_value; };
  const pending = (rows ?? []).filter((r) => r.value_raw && !["accepted", "kept", "held", "dropped"].includes(String(prevBy.get(r.id)?.resolved ?? "")) && !aiOk(r.id));
  const ordered = [...pending.filter((r) => !prevBy.has(r.id)), ...pending.filter((r) => prevBy.has(r.id))];
  const targets = ordered.map((r) => {
    const p = prevBy.get(r.id);
    const avoid = [...(((p?.redraft_history as string[] | null) ?? [])), ...(p?.suggestion_value ? [p.suggestion_value as string] : [])].slice(-5);
    return { id: r.id, value: r.value_raw as string, experience: r.experience_value_v1, target: r.target, avoid };
  }).slice(0, 30); // 未決の組から30組ずつ（先に絞ってから30件。31組目以降も次の実行でレビューされる）
  if (!targets.length) { revalidatePath("/sheet/merge"); return; }
  const results = await aiGuard(supabase, company.id, user.id, "vague_check.run", () => diagnoseRows({ companyName: company.name, summary, rows: targets }));
  if (!results) { revalidatePath("/sheet/merge"); return; }
  const ids = new Set(targets.map((t) => t.id));
  const upserts = results.filter((d) => ids.has(d.id)).map((d) => ({
    row_id: d.id, vague_score: Math.max(0, Math.min(3, Number(d.vague_score) || 0)), issues: (d.issues ?? []).slice(0, 3),
    suggestion_value: d.suggestion_value || null, suggestion_experience: d.suggestion_experience || null, resolved: null, checked_at: new Date().toISOString(),
    redraft_history: targets.find((t) => t.id === d.id)?.avoid ?? [],
  }));
  if (upserts.length) await supabase.from("row_diagnoses").upsert(upserts, { onConflict: "row_id" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "vague_check.run", payload: { n: upserts.length } });
  await notifyStep2Done(supabase, company.id, company.name, company.status, user.id);
  revalidatePath("/sheet/merge");
  revalidatePath("/sheet/diverge");
}

/** 言い直し案を採用する／そのままでよいとする */
export async function resolveDiagnosis(formData: FormData) {
  const { supabase, company, user } = await requireStage("merge");
  const rowId = String(formData.get("row_id"));
  const action = String(formData.get("action")); // accept | keep | hold | drop
  const { data: row } = await supabase.from("sheet_rows").select("id, value_raw, experience_value_v1").eq("id", rowId).eq("company_id", company.id).maybeSingle();
  const { data: d0 } = await supabase.from("row_diagnoses").select("*").eq("row_id", rowId).maybeSingle();
  if (!row) return;
  // 辞書の印だけでAIのレビュー行が無い組でも決められるよう、無ければ作る
  const d = d0 ?? (await supabase.from("row_diagnoses").upsert({ row_id: rowId, vague_score: 0, issues: [], suggestion_value: null, suggestion_experience: null, resolved: null, checked_at: new Date().toISOString() }, { onConflict: "row_id" }).select("*").single()).data;
  if (!d) return;
  if (action === "accept") {
    const after = cut(String(formData.get("after") || d.suggestion_value || "").trim(), MAX.value);
    const afterExp = cut(String(formData.get("after_experience") || d.suggestion_experience || row.experience_value_v1 || "").trim(), MAX.value);
    if (!after) return;
    const expChanged = afterExp !== (row.experience_value_v1 ?? "");
    await supabase.from("sheet_rows").update({ value_raw: after, experience_value_v1: afterExp || null, ...(expChanged ? { experience_value: afterExp || null } : {}), created_by: "customer" }).eq("id", rowId);
    await supabase.from("sheet_row_reviews").insert({ row_id: rowId, column_key: "value_raw", action: "fix", before_text: row.value_raw, after_text: after, reviewer_id: user.id });
    await supabase.from("row_diagnoses").update({ resolved: "accepted", vague_score: 0 }).eq("row_id", rowId);
  } else if (action === "drop") {
    // 却下：行は消さず status=dropped（組数からも外れる）。「却下した組」から戻せる
    await supabase.from("sheet_rows").update({ status: "dropped", confirmed_at: null }).eq("id", rowId);
    await supabase.from("sheet_row_reviews").insert({ row_id: rowId, column_key: "value_raw", action: "hold", before_text: row.value_raw, after_text: "", reviewer_id: user.id });
    await supabase.from("row_diagnoses").update({ resolved: "dropped" }).eq("row_id", rowId);
  } else if (action === "hold") {
    await supabase.from("sheet_rows").update({ status: "held", confirmed_at: null }).eq("id", rowId);
    await supabase.from("sheet_row_reviews").insert({ row_id: rowId, column_key: "value_raw", action: "hold", before_text: row.value_raw, after_text: row.value_raw, reviewer_id: user.id });
    await supabase.from("row_diagnoses").update({ resolved: "held" }).eq("row_id", rowId);
  } else {
    await supabase.from("row_diagnoses").update({ resolved: "kept" }).eq("row_id", rowId);
  }
  revalidatePath("/sheet/merge");
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "vague_check.resolve" });
  await notifyStep2Done(supabase, company.id, company.name, company.status, user.id);
  revalidatePath("/sheet/diverge");
}

/** この組だけ、AIに別の言い直し案を出してもらう（前の案と同じにならないように伝える） */
export async function redraftDiagnosis(formData: FormData) {
  const { supabase, company, user } = await requireStage("merge");
  const rowId = String(formData.get("row_id"));
  const [summary, { data: row }, { data: d }] = await Promise.all([
    loadProfileContext(supabase, company.id),
    supabase.from("sheet_rows").select("id, value_raw, experience_value_v1, target").eq("id", rowId).eq("company_id", company.id).maybeSingle(),
    supabase.from("row_diagnoses").select("suggestion_value, suggestion_experience, redraft_history").eq("row_id", rowId).maybeSingle(),
  ]);
  if (!row?.value_raw) return;
  const prev: string[] = [...((d?.redraft_history as string[] | null) ?? []), ...(d?.suggestion_value ? [d.suggestion_value as string] : [])].slice(-5);
  const results = await aiGuard(supabase, company.id, user.id, "vague_check.redraft", () => diagnoseRows({ companyName: company.name, summary, rows: [{ id: row.id, value: row.value_raw as string, experience: row.experience_value_v1, target: row.target, avoid: prev }] }));
  const r = results?.find((x) => x.id === row.id);
  if (!r) { revalidatePath("/sheet/merge"); return; }
  await supabase.from("row_diagnoses").upsert({
    row_id: row.id, vague_score: Math.max(1, Math.min(3, Number(r.vague_score) || 1)), issues: (r.issues ?? []).slice(0, 3),
    suggestion_value: r.suggestion_value || d?.suggestion_value || null, suggestion_experience: r.suggestion_experience || d?.suggestion_experience || null,
    resolved: null, checked_at: new Date().toISOString(), redraft_history: prev,
  }, { onConflict: "row_id" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "vague_check.redraft", payload: { row_id: row.id } });
  revalidatePath("/sheet/merge");
}

/** 決めた組をもう一度ふわっと診断の一覧に戻す（決定した言葉はそのまま。保留にしていた行は戻さない） */
export async function reopenDiagnosis(formData: FormData) {
  const { supabase, company, user } = await requireStage("merge");
  const rowId = String(formData.get("row_id"));
  const { data: row } = await supabase.from("sheet_rows").select("id, status").eq("id", rowId).eq("company_id", company.id).maybeSingle();
  if (!row) return;
  // 却下・保留から戻すときは行を active に戻す
  if (row.status === "dropped" || row.status === "held") await supabase.from("sheet_rows").update({ status: "active" }).eq("id", rowId);
  await supabase.from("row_diagnoses").update({ resolved: null }).eq("row_id", rowId);
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "vague_check.reopen", payload: { row_id: rowId } });
  revalidatePath("/sheet/merge");
}
