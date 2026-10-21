import "server-only";
import { redirect } from "next/navigation";
import { requireWritableCustomer } from "@/lib/session";
import { STAGES, isStageOpen } from "@/lib/stages";
import { isStep0Ready } from "@/server/gates";

/**
 * 書き込みのサーバ処理で使う入口。画面と同じ条件で「その段階が開いているか」を確かめる。
 * 画面を通さず直接呼ばれても、開いていない段階のデータ作成・AI呼び出しをさせない。
 */
export async function requireStage(stageKey: string) {
  const ctx = await requireWritableCustomer();
  const stage = STAGES.find((s) => s.key === stageKey);
  if (!stage || !isStageOpen(stage, ctx.company.status)) redirect("/");
  if (stageKey !== "step0" && !(await isStep0Ready(ctx.supabase, ctx.company.id))) redirect("/");
  if (stageKey === "merge" && ctx.company.status === "week1_2") {
    // STEP 2 は 20組そろってから（レビューを始めた会社は、却下で割っても続けられる。画面と同じ）
    const [{ data: pg }, { count: started }] = await Promise.all([
      ctx.supabase.from("v_divergence_progress").select("pair_count").eq("company_id", ctx.company.id).maybeSingle(),
      ctx.supabase.from("row_diagnoses").select("row_id, sheet_rows!inner(company_id)", { count: "exact", head: true }).eq("sheet_rows.company_id", ctx.company.id),
    ]);
    if ((pg?.pair_count ?? 0) < 20 && !started) redirect("/");
  }
  return ctx;
}
