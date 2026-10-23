"use server";
import { revalidatePath } from "next/cache";
import { requireStage } from "@/server/stageGuard";
import { isMember } from "@/lib/session";
import { aiGuard } from "@/server/aiGuard";
import { loadProfileContext } from "@/server/profile";
import { findEvidenceCandidates, type RowIn } from "@/server/evidence";
import { CLAIM_RE, KIND_SET, STRENGTH_OF, buildClaims, triedKey } from "@/lib/evidence";
import { cut } from "@/lib/limits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 6;
const back = () => revalidatePath("/sheet/evidence");

/** 組（と、その組のブレーキ）が御社のものか */
async function ownRow(supabase: Awaited<ReturnType<typeof requireStage>>["supabase"], companyId: string, rowId: string) {
  if (!UUID.test(rowId)) return null;
  const { data } = await supabase.from("sheet_rows").select("id").eq("id", rowId).eq("company_id", companyId).eq("status", "active").maybeSingle();
  return data;
}

/** 証拠を自分で入れる（採用済みとして保存） */
export async function addEvidence(formData: FormData) {
  const { supabase, company, user, profile } = await requireStage("evidence");
  const rowId = String(formData.get("row_id") ?? "");
  if (!(await ownRow(supabase, company.id, rowId))) return;
  const content = cut(String(formData.get("content") ?? "").trim(), 2000);
  const kind = String(formData.get("kind") ?? "");
  if (!content || !KIND_SET.has(kind)) return;
  const ref = String(formData.get("claim_ref") ?? "");
  const what = cut(String(formData.get("what") ?? "").trim(), 600);
  await supabase.from("evidences").insert({
    row_id: rowId, content, kind, strength: STRENGTH_OF[kind], status: isMember(profile) ? "candidate" : "adopted", created_by: "customer", // メンバーが足した証拠は担当者の採用待ち
    source: cut(String(formData.get("source") ?? "").trim(), 300) || null,
    claim_ref: CLAIM_RE.test(ref) ? ref : null, what: what || null,
  });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "evidence.add" });
  back();
}

/** AIの候補を採用する／見送る、採用した証拠を取り下げる（担当者だけ） */
export async function decideEvidence(formData: FormData) {
  const { supabase, company, user, profile } = await requireStage("evidence");
  if (isMember(profile)) { back(); return; }
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? ""); // accept | drop
  if (!UUID.test(id)) return;
  const { data: ev } = await supabase.from("evidences").select("id, status, sheet_rows!inner(company_id)").eq("id", id).eq("sheet_rows.company_id", company.id).maybeSingle();
  if (!ev) return;
  if (action === "accept" && ev.status === "candidate") {
    const kind = String(formData.get("kind") ?? "");
    await supabase.from("evidences").update({ status: "adopted", ...(KIND_SET.has(kind) ? { kind, strength: STRENGTH_OF[kind] } : {}) }).eq("id", id);
  } else if (action === "drop") {
    // 証拠は組（sheet_rows）ではないので、見送り・取り下げは消してよい
    await supabase.from("evidences").delete().eq("id", id);
  } else return;
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: `evidence.${action}` });
  back();
}

/** 証拠がついた「なぜなら」の印を事実に変える（担当者だけ。証拠が1件以上ついているときだけ） */
export async function markClaimFact(formData: FormData) {
  const { supabase, company, user, profile } = await requireStage("evidence");
  if (isMember(profile)) { back(); return; }
  const rowId = String(formData.get("row_id") ?? "");
  const ref = String(formData.get("claim_ref") ?? "");
  if (!CLAIM_RE.test(ref) || !(await ownRow(supabase, company.id, rowId))) return;
  const { count } = await supabase.from("evidences").select("id", { count: "exact", head: true }).eq("row_id", rowId).eq("claim_ref", ref).eq("status", "adopted");
  if (!count) { back(); return; }
  if (ref === "row") {
    await supabase.from("sheet_rows").update({ because_tag: "fact" }).eq("id", rowId).eq("company_id", company.id);
  } else {
    await supabase.from("brakes").update({ because_tag: "fact" }).eq("id", ref.slice(6)).eq("row_id", rowId);
  }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "evidence.fact", payload: { ref } });
  back();
}

/** AIに、資料・面談記録から証拠の候補を探してもらう（まだ証拠も候補も無い組から BATCH 組ずつ） */
export async function requestEvidenceCandidates() {
  const { supabase, company, user } = await requireStage("evidence");
  const [{ data: rows }, { data: brakes }, { data: evs }, ctx, { data: tried }] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq, rank, value_raw, experience_value, experience_value_v1, because_phrase, because_tag").eq("company_id", company.id).eq("status", "active"),
    supabase.from("brakes").select("id, row_id, customer_words, counter_message, because, because_tag, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id).eq("status", "active"),
    supabase.from("evidences").select("row_id, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id),
    loadProfileContext(supabase, company.id),
    supabase.from("activity_log").select("payload").eq("company_id", company.id).eq("event", "evidence.draft"),
  ]);
  // 証拠・候補がある組と、AIが一度探して見つからなかった組は、もう一度は探さない（同じ材料なら結果は変わらないため）
  const has = new Set((evs ?? []).map((e) => e.row_id));
  const triedSet = new Set((tried ?? []).flatMap((t) => ((t.payload as { tried?: string[] } | null)?.tried ?? [])));
  const ordered = (rows ?? []).filter((r) => r.value_raw && !has.has(r.id))
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.seq - b.seq);
  const targets: RowIn[] = ordered.map((r) => ({
    id: r.id, value: r.value_raw as string, experience: r.experience_value ?? r.experience_value_v1,
    claims: buildClaims(r, (brakes ?? []).filter((b) => b.row_id === r.id)).map((c) => ({ ref: c.ref, label: c.label, text: c.text })),
  })).filter((t) => t.claims.length > 0 && !triedSet.has(triedKey(t.id, t.claims))).slice(0, BATCH);
  if (!targets.length) { back(); return; }
  // 材料はお客様の発言・事実だけ（AIの下書きのまま承認されていない説明や、競合の一覧は証拠にならない）
  // 面談の記録のうち「その場で作った組」は主張そのもの（証拠にすると自分で自分を裏づけることになる）なので外す
  const materials = Object.fromEntries(Object.entries(ctx)
    .filter(([k]) => !k.includes("AI下書き") && !k.includes("修正案") && !k.startsWith("競合") && !k.startsWith("対象"))
    .map(([k, v]) => [k, v.replace(/その場で作った組：\n[\s\S]*?(?=\n(?:メモ・資料：|書き起こし（抜粋）：|【)|\n\n|$)/g, "")]));
  const found = await aiGuard(supabase, company.id, user.id, "evidence.draft", () => findEvidenceCandidates({ companyName: company.name, materials, rows: targets }));
  if (!found) { back(); return; }
  const recs = found.slice(0, BATCH * 3).map((d) => ({
    row_id: d.row_id, claim_ref: d.claim_ref, what: d.what || null, content: d.content, kind: d.kind, strength: STRENGTH_OF[d.kind],
    source: d.source || null, status: "candidate", created_by: "ai",
  }));
  // 待つ間に別の画面で候補・証拠が入った組には入れない（同じ候補が二重にならないように）
  const { data: nowEv } = await supabase.from("evidences").select("row_id").in("row_id", targets.map((t) => t.id));
  const busy = new Set((nowEv ?? []).map((e) => e.row_id));
  const fresh = recs.filter((r) => !busy.has(r.row_id));
  if (fresh.length) {
    const { error } = await supabase.from("evidences").insert(fresh);
    if (error) {
      // 保存できなかったときは「探した」印をつけない（次にもう一度探せるように）
      await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "evidence.draft.error", payload: { msg: `保存できませんでした：${error.message}`.slice(0, 300) } });
      back(); return;
    }
  }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "evidence.draft", payload: { n: fresh.length, rows: targets.length, tried: targets.filter((t) => !busy.has(t.id)).map((t) => triedKey(t.id, t.claims)) } });
  back();
}
