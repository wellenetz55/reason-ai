import "server-only";
import { zipSync, strToU8 } from "fflate";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

/** バックアップに含める表（public スキーマの全テーブル。表を足したらここにも足す） */
const TABLES = [
  "companies", "profiles", "company_meetings", "meeting_records", "meeting_files", "company_documents", "company_profile_summary", "profile_items",
  "diagnosis_results", "diagnosis_intakes", "diagnosis_intake_files", "sheet_rows", "sheet_row_reviews", "row_diagnoses", "sheet_locks", "sheet_lock_history",
  "brakes", "evidences", "litmus_market", "litmus_niche", "competitors", "competitor_comparisons",
  "deployments", "activation_packages", "disclosure_requests", "homeworks", "questions_to_operator", "member_notes",
  "error_reports", "alerts", "activity_log", "generation_counters",
  "method_facets", "method_fixed_texts", "method_prompts", "method_techniques", "method_principles",
];

// Excel の1セルは 32,767 字まで。XML で使えない制御文字も除く（全文は data/*.json にある）
const cell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const raw = typeof v === "object" ? JSON.stringify(v) : v;
  if (typeof raw !== "string") return raw as number | boolean;
  const clean = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return clean.length > 32000 ? clean.slice(0, 32000) + "…（長いため省略。全文は data/ の JSON）" : clean;
};

/** 全データを1つのZIPにする。中身：data/<表>.json（復元用）、全データ.xlsx（閲覧用）、users.json、files/（アップロード資料）、README.txt */
export async function buildBackup(admin: SupabaseClient) {
  const files: Record<string, Uint8Array> = {};
  const wb = new ExcelJS.Workbook();
  const counts: string[] = [];
  const failed: string[] = [];

  for (const t of TABLES) {
    const rows: Record<string, unknown>[] = [];
    let ok = true;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(t).select("*").range(from, from + 999);
      if (error) { ok = false; failed.push(`${t}: ${error.message}`); break; }
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    if (!ok) continue;
    files[`data/${t}.json`] = strToU8(JSON.stringify(rows, null, 1));
    counts.push(`${t}\t${rows.length}`);
    const ws = wb.addWorksheet(t.slice(0, 31));
    const cols = rows.length ? Object.keys(rows[0]) : [];
    if (cols.length) {
      ws.addRow(cols).font = { bold: true };
      for (const r of rows) ws.addRow(cols.map((c) => cell(r[c])));
    }
  }

  // サインイン用アカウント（パスワード等は含めない）
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  files["users.json"] = strToU8(JSON.stringify((list?.users ?? []).map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at })), null, 1));

  // アップロードされた資料（company-docs バケット。フォルダをたどる）
  const fileErrors: string[] = [];
  async function walk(prefix: string) {
    const entries: { name: string; id: string | null }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from("company-docs").list(prefix, { limit: 1000, offset });
      if (error) { fileErrors.push(`${prefix}: ${error.message}`); return; }
      entries.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    for (const o of entries) {
      const path = prefix ? `${prefix}/${o.name}` : o.name;
      if (o.id === null) { await walk(path); continue; } // フォルダ
      const { data: blob, error: de } = await admin.storage.from("company-docs").download(path);
      if (de || !blob) { fileErrors.push(`${path}: ${de?.message ?? "download failed"}`); continue; }
      files[`files/${path}`] = new Uint8Array(await blob.arrayBuffer());
    }
  }
  await walk("");

  const now = new Date();
  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(now).replace(/[-: ]/g, "").slice(0, 12);
  files["全データ.xlsx"] = new Uint8Array(await wb.xlsx.writeBuffer());
  files["README.txt"] = strToU8([
    "選ばれる理由AI 全データのバックアップ",
    `作成：${now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（日本時間）`,
    "",
    "data/<表>.json  … 復元用。1つの表＝1ファイル",
    "全データ.xlsx   … 閲覧用。1つの表＝1シート",
    "users.json      … サインイン用アカウント（メールアドレスのみ。パスワードは含みません）",
    "files/          … お客様がアップロードした資料・エラーレポートの画像",
    "",
    "件数：",
    ...counts,
    ...(failed.length ? ["", "読めなかった表：", ...failed] : []),
    ...(fileErrors.length ? ["", "読めなかったファイル：", ...fileErrors] : []),
    "",
    "注意：メソッド資産（method_*）を含みます。社外に出さないでください。",
  ].join("\r\n"));

  return {
    zip: zipSync(files, { level: 6 }),
    filename: `選ばれる理由AI_バックアップ_${stamp}.zip`,
    tables: counts.length,
    fileCount: Object.keys(files).filter((k) => k.startsWith("files/")).length,
    problems: [...failed, ...fileErrors],
  };
}
