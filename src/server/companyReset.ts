import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** リセットで選べる範囲。消す表は SQL 0022 の reset_company() と同じ並び */
export const RESET_PARTS = [
  { key: "sheet", label: "提供価値シート", note: "行と、行にひもづく診断・裏づけ・リトマス・メモ・レビュー履歴。展開、競合、AI生成回数も", tables: ["sheet_rows", "deployments", "activation_packages", "sheet_locks", "competitors", "generation_counters"] },
  { key: "materials", label: "STEP 0 の資料と会社プロフィール", note: "アップロードした資料・URL、AIがまとめた会社プロフィール。資料ファイルは控えの場所へ移します", tables: ["company_documents", "profile_items", "company_profile_summary"] },
  { key: "communication", label: "宿題・質問・面談などのやりとり", note: "宿題、質問、エラーレポート、面談、アラート、操作記録、開示要求", tables: ["homeworks", "questions_to_operator", "error_reports", "company_meetings", "alerts", "activity_log", "disclosure_requests"] },
  { key: "diagnosis", label: "適合診断の記録と結果", note: "聞き取りの記録・書き起こし・面談メモ、お客様に見せた診断結果", tables: ["diagnosis_intakes", "diagnosis_intake_files", "diagnosis_results"] },
  { key: "status", label: "状態を「診断済み（契約前）」に戻す", note: "申込・契約・入金・キックオフ・各期限の日付も空にします", tables: [] as string[] },
] as const;
export type ResetPart = (typeof RESET_PARTS)[number]["key"];
export const PART_KEYS = RESET_PARTS.map((p) => p.key) as ResetPart[];

/** 行（sheet_rows）にひもづく表。会社IDを持たないので、行IDで集める */
const ROW_TABLES = ["sheet_row_reviews", "row_diagnoses", "brakes", "evidences", "litmus_market", "litmus_niche", "member_notes", "competitor_comparisons", "sheet_lock_history"];

/** 範囲ごとの件数（確認画面に出す） */
export async function countResetTargets(admin: SupabaseClient, companyId: string): Promise<Record<string, number>> {
  const tables = RESET_PARTS.flatMap((p) => p.tables);
  const counts = await Promise.all(tables.map(async (t) => {
    const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("company_id", companyId);
    return [t, count ?? 0] as const;
  }));
  return Object.fromEntries(counts);
}

async function selectAll(admin: SupabaseClient, table: string, col: string, ids: string[]) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(table).select("*").in(col, chunk).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

/**
 * 消す前の控え（その会社の全データ）を backups バケットに JSON で保存する。保存できなければ消さない。
 * 戻したいときは、この JSON から復元する（ベレネッツ側で作業）。
 */
export async function snapshotCompany(admin: SupabaseClient, companyId: string, stamp: string): Promise<string> {
  const data: Record<string, unknown> = { company_id: companyId, taken_at: new Date().toISOString() };
  const { data: company } = await admin.from("companies").select("*").eq("id", companyId).single();
  data.companies = [company];
  for (const t of RESET_PARTS.flatMap((p) => p.tables)) data[t] = await selectAll(admin, t, "company_id", [companyId]);
  const rowIds = (data.sheet_rows as { id: string }[]).map((r) => r.id);
  for (const t of ROW_TABLES) data[t] = rowIds.length ? await selectAll(admin, t, "row_id", rowIds) : [];
  const path = `resets/${companyId}/${stamp}.json`;
  const { error } = await admin.storage.from("backups").upload(path, Buffer.from(JSON.stringify(data, null, 1)), { contentType: "application/json", upsert: false });
  if (error) throw new Error("控えを保存できませんでした：" + error.message);
  return path;
}

/** 消した資料・スクリーンショットのファイルを、お客様から見えない控えの場所（_reset/）へ移す */
export async function moveFilesAside(admin: SupabaseClient, companyId: string, stamp: string, paths: string[]): Promise<number> {
  let failed = 0;
  for (const p of paths) {
    const { error } = await admin.storage.from("company-docs").move(p, `_reset/${companyId}/${stamp}/${p}`);
    if (error) failed++;
  }
  return failed;
}
