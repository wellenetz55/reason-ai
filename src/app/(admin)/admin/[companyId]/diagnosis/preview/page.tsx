import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOperator } from "@/lib/session";
import { DiagnosisView } from "@/components/DiagnosisView";

/** お客様に見える「適合診断の結果」を、公開前にそのまま見る（保存した内容。ボタンは押せない） */
export default async function DiagnosisPreview({ params }: PageProps<"/admin/[companyId]/diagnosis/preview">) {
  const { companyId } = await params;
  const { supabase } = await requireOperator();
  const [{ data: c }, { data: d }] = await Promise.all([
    supabase.from("companies").select("id, name, status, applied_at, contracted_at, paid_at").eq("id", companyId).single(),
    supabase.from("diagnosis_results").select("*").eq("company_id", companyId).maybeSingle(),
  ]);
  if (!c) notFound();
  return (
    <div>
      <div className="sticky top-0 z-10 -mx-10 -mt-10 mb-8 px-10 py-3 bg-warm-soft border-b border-warm flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-warm">プレビュー</span>
        <span className="text-ink-2">お客様にはこのように見えます（「保存する」を押した内容。申込・日程のボタンは押せません）。{d?.published_at ? "公開済みです。" : "まだ公開していません。"}</span>
        <Link href={`/admin/${c.id}/diagnosis`} className="ml-auto underline underline-offset-4">← 結果を書く画面へ戻る</Link>
      </div>
      {!d ? (
        <p className="text-sm text-ink-2">まだ何も保存されていません。「適合診断の結果を書く」で入力して「保存する」を押すと、ここに表示されます。</p>
      ) : (
        <div className="rounded-[var(--radius)] border hairline px-6 sm:px-10 py-10 bg-paper">
          <DiagnosisView company={c} d={d} preview />
        </div>
      )}
    </div>
  );
}
