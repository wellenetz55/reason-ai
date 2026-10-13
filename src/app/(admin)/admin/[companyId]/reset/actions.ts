"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { PART_KEYS, type ResetPart, snapshotCompany, moveFilesAside } from "@/server/companyReset";

/**
 * 会社のデータをリセット（スーパー管理者だけ）。
 * 確認画面で会社名をそのまま入力したときだけ動く。消す前に必ず控えを保存し、保存できなければ何も消さない。
 */
export async function resetCompany(formData: FormData) {
  await requireSuperAdmin();
  const companyId = String(formData.get("company_id") || "");
  const back = (q: string): never => redirect(`/admin/${companyId}/reset?${q}`);
  const parts = PART_KEYS.filter((k) => formData.get(`part_${k}`) === "on") as ResetPart[];
  const typed = String(formData.get("confirm_name") || "").trim();
  const admin = createAdminClient();
  const { data: c } = await admin.from("companies").select("id, name").eq("id", companyId).maybeSingle();
  if (!c) back(`error=${encodeURIComponent("会社が見つかりません")}`);
  if (!parts.length) back(`error=${encodeURIComponent("消す範囲を1つ以上選んでください")}`);
  if (typed !== c!.name.trim()) back(`error=${encodeURIComponent("確認のための会社名が一致しません。何も消していません")}`);

  // 消したあとに移すファイルの場所を先に控える
  const files: string[] = [];
  if (parts.includes("materials")) {
    const { data } = await admin.from("company_documents").select("storage_path").eq("company_id", companyId).not("storage_path", "is", null);
    files.push(...(data ?? []).map((d) => d.storage_path as string));
  }
  if (parts.includes("communication")) {
    const { data } = await admin.from("error_reports").select("screenshot_path").eq("company_id", companyId).not("screenshot_path", "is", null);
    files.push(...(data ?? []).map((d) => d.screenshot_path as string));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let snapshot = "";
  try {
    snapshot = await snapshotCompany(admin, companyId, stamp);
  } catch (e) {
    back(`error=${encodeURIComponent((e as Error).message + "。何も消していません")}`);
  }

  const { error } = await admin.rpc("reset_company", { p_company: companyId, p_parts: parts });
  if (error) back(`error=${encodeURIComponent("リセットできませんでした（SQL 0022 が未実行の可能性があります）。何も消していません：" + error.message)}`);

  const failed = files.length ? await moveFilesAside(admin, companyId, stamp, files) : 0;
  revalidatePath("/", "layout"); // 管理画面もお客様の画面も、古い表示を残さない
  back(`ok=1&snap=${encodeURIComponent(snapshot)}${failed ? `&filefail=${failed}` : ""}`);
}
