import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_LABEL } from "@/lib/stages";
import { ClearQuery } from "@/components/ClearQuery";
import { ResetConfirm } from "@/components/ResetConfirm";
import { RESET_PARTS, countResetTargets } from "@/server/companyReset";
import { resetCompany } from "./actions";

const TABLE_LABEL: Record<string, string> = {
  sheet_rows: "シートの行", deployments: "展開", activation_packages: "展開パッケージ", sheet_locks: "ロック", competitors: "競合", generation_counters: "AI生成回数の記録",
  company_documents: "資料・URL", profile_items: "プロフィール項目", company_profile_summary: "プロフィール要約",
  homeworks: "宿題", questions_to_operator: "質問", error_reports: "エラーレポート", company_meetings: "面談", alerts: "アラート", activity_log: "操作記録", disclosure_requests: "開示要求",
  diagnosis_intakes: "適合診断の記録", diagnosis_intake_files: "面談メモ・資料", diagnosis_results: "適合診断の結果",
};

export default async function ResetPage({ params, searchParams }: PageProps<"/admin/[companyId]/reset">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const err = typeof sp?.error === "string" ? sp.error : null;
  const done = sp?.ok === "1";
  const snap = typeof sp?.snap === "string" ? sp.snap : "";
  const fileFail = typeof sp?.filefail === "string" ? sp.filefail : "";
  const { isSuper } = await requireOperator();
  const admin = createAdminClient();
  const [{ data: c }, counts, { count: members }] = await Promise.all([
    admin.from("companies").select("id, name, status").eq("id", companyId).maybeSingle(),
    countResetTargets(admin, companyId),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId),
  ]);
  if (!c) notFound();
  const inProgram = !["diagnosed"].includes(c.status);

  return (
    <div className="max-w-[760px]">
      <ClearQuery keys={["error"]} />
      <p className="text-xs text-ink-3"><Link href={`/admin/${c.id}`} className="hover:text-ink">{c.name}</Link> / データのリセット</p>
      <h1 className="serif text-[28px] leading-tight mt-1">この会社のデータをリセット</h1>

      {done ? (
        <div className="mt-6 rounded-[var(--radius)] bg-paper-2 px-5 py-4 text-sm space-y-2">
          <p className="font-semibold">リセットしました。</p>
          <p>消す前の控えを保存してあります（管理用の保存場所：<span className="num break-all">{snap}</span>）。間違えて消したときは、この控えから戻せます（戻す作業は開発側で行います）。</p>
          {fileFail && <p className="text-warm">資料ファイルのうち {fileFail} 件は控えの場所へ移せませんでした（データの削除は済んでいます）。</p>}
          <p><Link href={`/admin/${c.id}`} className="underline underline-offset-4">会社ページへ戻る</Link></p>
        </div>
      ) : !isSuper ? (
        <p className="mt-6 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm">リセットはスーパー管理者だけができます。</p>
      ) : (
        <>
          <div className="mt-6 rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-5 py-4 text-sm space-y-1.5">
            <p className="font-semibold text-warm">選んだ範囲のデータを消します。元に戻すボタンはありません。</p>
            <p>テストで入れた情報を消して、会社を最初の状態に戻すための機能です。会社・会社名・担当者（サインインできる人 {members ?? 0} 人）は消しません。</p>
            <p>消す前に、この会社の全データの控えを自動で保存します。控えを保存できなかったときは、何も消しません。</p>
            {inProgram && (members ?? 0) > 0 && <p className="font-semibold">この会社はいま「{STATUS_LABEL[c.status] ?? c.status}」で、担当者がいます。本番のお客様ではないか、もう一度確かめてください。</p>}
          </div>
          {err && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm">{err}</p>}

          <form action={resetCompany} className="mt-8 space-y-8">
            <input type="hidden" name="company_id" value={c.id} />
            <fieldset>
              <legend className="serif text-[17px]">消す範囲</legend>
              <p className="text-xs text-ink-3 mt-1">最初はすべて選んであります。残したいものは外してください。</p>
              <div className="mt-4 space-y-4">
                {RESET_PARTS.map((p) => {
                  const items = p.tables.map((t) => ({ t, n: counts[t] ?? 0 })).filter((x) => x.n > 0);
                  return (
                    <label key={p.key} className="flex gap-3 items-start">
                      <input type="checkbox" name={`part_${p.key}`} defaultChecked className="mt-1 size-4 shrink-0" />
                      <span className="text-sm">
                        <span className="font-semibold">{p.label}</span>
                        <span className="block text-xs text-ink-3 mt-0.5">{p.note}</span>
                        {p.key === "status" ? (
                          <span className="block text-xs text-ink-2 mt-1">いま：{STATUS_LABEL[c.status] ?? c.status}</span>
                        ) : (
                          <span className="block text-xs text-ink-2 mt-1 num">{items.length ? items.map((x) => `${TABLE_LABEL[x.t] ?? x.t} ${x.n}件`).join("・") : "消すデータはありません"}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <ResetConfirm name={c.name} />
          </form>
        </>
      )}
    </div>
  );
}
