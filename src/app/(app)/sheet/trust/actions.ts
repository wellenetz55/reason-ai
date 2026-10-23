"use server";
import { isMember } from "@/lib/session";
import { MAX, cut } from "@/lib/limits";
import { revalidatePath } from "next/cache";
import { requireStage } from "@/server/stageGuard";
import { draftBecause } from "@/server/because";
import { loadProfileContext } from "@/server/profile";
import { aiGuard } from "@/server/aiGuard";

/** なぜならが空の行（最大10）に AI の下書きを付ける */
export async function requestBecauseDrafts() {
  const { supabase, company, user } = await requireStage("trust");
  // 材料は他のステップと同じ（御社の説明の下書き・資料・適合診断・面談記録も含む）。承認済みの項目だけだと、資料はあるのに根拠が拾えない
  const [profile, { data: rows }] = await Promise.all([
    loadProfileContext(supabase, company.id),
    supabase.from("sheet_rows").select("id, value_raw, experience_value, experience_value_v1").eq("company_id", company.id).eq("status", "active").or("because_phrase.is.null,because_phrase.eq.").order("seq").limit(10),
  ]);
  const targets = (rows ?? []).filter((r) => r.value_raw).map((r) => ({ id: r.id, value: r.value_raw as string, experience: r.experience_value ?? r.experience_value_v1 }));
  // 「なぜなら」が空の組が無ければAIを呼ばない（呼び出し回数の上限を無駄に使わない）
  if (!targets.length) { revalidatePath("/sheet/trust"); return; }
  const drafts = await aiGuard(supabase, company.id, user.id, "because.draft", () => draftBecause({ companyName: company.name, profile, rows: targets }));
  if (!drafts) { revalidatePath("/sheet/trust"); return; }
  const TAGS = ["fact", "verify", "hypothesis"];
  for (const d of drafts) {
    const t = targets.find((x) => x.id === d.id);
    if (!t || !d.because) continue;
    const patch: Record<string, unknown> = { because_phrase: d.because, because_tag: TAGS.includes(String(d.tag)) ? d.tag : "hypothesis", because_only_us: !!d.only_us, because_by: "ai", trust_axis: d.type ?? null };
    // お客様の体験価値は上書きしない（空のときだけAIの下書きを入れる）
    if (d.experience && !t.experience) patch.experience_value = d.experience;
    // AIを待つ間にお客様が「なぜなら」を書いていたら上書きしない（空のままの行だけに入れる）
    await supabase.from("sheet_rows").update(patch).eq("id", d.id).eq("company_id", company.id).or("because_phrase.is.null,because_phrase.eq.");
  }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "because.draft", payload: { n: drafts.length } });
  revalidatePath("/sheet/trust");
}

/** 三連を直す／承認する */
export async function saveTriple(formData: FormData) {
  const { supabase, company, user, profile } = await requireStage("trust");
  const rowId = String(formData.get("row_id"));
  const action = String(formData.get("action")); // fix | approve
  if (isMember(profile) && action !== "fix") { revalidatePath("/sheet/trust"); return; } // 承認は担当者だけ
  const { data: row } = await supabase.from("sheet_rows").select("id, experience_value, experience_value_v1, because_phrase").eq("id", rowId).eq("company_id", company.id).maybeSingle();
  if (!row) return;
  const member = isMember(profile);
  // メンバーの修正は承認待ち（because_by を "ai" のままにして「承認」ボタンを残す）。印を「事実」にするのは担当者だけ
  const patch: Record<string, unknown> = { because_by: member ? "ai" : "customer" };
  if (action === "fix") {
    const exp = cut(String(formData.get("experience") || "").trim(), MAX.value);
    const because = cut(String(formData.get("because") || "").trim(), MAX.value);
    const tag = String(formData.get("tag") || "hypothesis");
    patch.experience_value = exp || null;
    patch.because_phrase = because || null;
    patch.because_tag = member && tag === "fact" ? "verify" : ["fact", "verify", "hypothesis"].includes(tag) ? tag : "hypothesis";
    patch.because_only_us = formData.get("only_us") === "1";
    patch.trust_axis = String(formData.get("type") || "") || null;
    await supabase.from("sheet_row_reviews").insert({ row_id: rowId, column_key: "because_phrase", action: "fix", before_text: row.because_phrase, after_text: because, reviewer_id: user.id });
  } else {
    if (!row.experience_value) patch.experience_value = row.experience_value_v1;
    await supabase.from("sheet_row_reviews").insert({ row_id: rowId, column_key: "because_phrase", action: "approve", before_text: row.because_phrase, after_text: row.because_phrase, reviewer_id: user.id });
  }
  await supabase.from("sheet_rows").update(patch).eq("id", rowId);
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "because.save" });
  revalidatePath("/sheet/trust");
}
