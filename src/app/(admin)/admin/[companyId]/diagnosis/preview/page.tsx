import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOperator } from "@/lib/session";
import { DiagnosisView } from "@/components/DiagnosisView";
import { ReasonLogo } from "@/components/Brand";
import { STATUS_LABEL } from "@/lib/stages";
import { ProgramOutline } from "@/components/ProgramOutline";

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
      <div data-print-hide className="sticky top-0 z-10 -mx-10 -mt-10 mb-8 px-10 py-3 bg-warm-soft border-b border-warm flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold text-warm">プレビュー</span>
        <span className="text-ink-2">お客様にはこのように見えます（「保存する」を押した内容。申込・日程のボタンは押せません）。{d?.published_at ? "公開済みです。" : "まだ公開していません。"}</span>
        <Link href={`/admin/${c.id}/diagnosis`} className="ml-auto underline underline-offset-4">← 結果を書く画面へ戻る</Link>
      </div>
      {!d ? (
        <p className="text-sm text-ink-2">まだ何も保存されていません。「適合診断の結果を書く」で入力して「保存する」を押すと、ここに表示されます。</p>
      ) : (
        <div className="rounded-[var(--radius)] border hairline bg-paper overflow-hidden flex flex-col md:flex-row print:border-0">
          {/* お客様の画面の左メニュー（見た目だけ。押せない） */}
          <aside aria-label="お客様の左メニュー（見本）" className="md:w-[260px] shrink-0 border-b md:border-b-0 md:border-r hairline px-6 py-8 bg-paper">
            <ReasonLogo width={212} />
            <p className="serif text-[16px] leading-snug mt-6">{c.name}</p>
            <p className="text-[13px] text-ink-2 mt-1">担当者 <span className="text-ink-3">さん</span></p>
            <div className="mt-3 rounded-[var(--radius)] border border-navy/30 bg-navy-soft px-3.5 py-2.5">
              <p className="text-[11px] font-semibold text-navy tracking-wide">現在のフェーズ</p>
              <p className="text-[13px] text-ink mt-0.5">{c.status === "diagnosed" ? "適合診断の結果をご確認ください" : STATUS_LABEL[c.status] ?? c.status}</p>
            </div>
            <nav className="mt-6">
              <p className="block text-[14px] py-[7px] pl-3 -ml-3 border-l-2 border-navy">適合診断の結果</p>
              <ProgramOutline />
            </nav>
            <span className="btn-primary mt-8 block text-center opacity-60 cursor-default">ベレネッツに質問を残す</span>
            <p className="mt-1.5 text-[11px] text-ink-3 text-center">ベレネッツからの回答は、質問と同じ画面に表示されます。</p>
          </aside>
          <div className="flex-1 min-w-0 px-6 sm:px-10 py-10">
            <DiagnosisView company={c} d={d} preview />
          </div>
        </div>
      )}
    </div>
  );
}
