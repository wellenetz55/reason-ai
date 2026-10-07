import Link from "next/link";
import { requireCustomer } from "@/lib/session";
import { STAGES, isStageOpen } from "@/lib/stages";

export default async function Home() {
  const { company, supabase } = await requireCustomer();
  const { data: progress } = await supabase.from("v_divergence_progress").select("*").eq("company_id", company.id).maybeSingle();
  const rows = progress?.row_count ?? 0;
  const open = STAGES.filter((s) => isStageOpen(s, company.status));
  const current = open[open.length - 1];

  return (
    <div>
      <h1 className="serif text-[32px] leading-tight">いま、{current ? current.label : "準備中"}。</h1>
      <p className="text-ink-2 mt-3 max-w-[60ch]">
        {company.status === "week1_2" && rows < 20 && `提供価値はあと${20 - rows}行で次に進めます。今日の面の問いに答えてください。`}
        {company.status === "week1_2" && rows >= 20 && `提供価値が${rows}行。まとめて絞る段階に進めます。`}
        {company.status === "onboarding" && "会社資料を上げると、AIが自社理解の下書きを作ります。"}
        {company.status === "week3_5" && "お客様の頭の中のブレーキを書き出し、先回りの答えを作ります。"}
        {company.status === "week6_8" && "証拠を集め、1位の提供価値を接点に展開します。"}
      </p>
      {current && (
        <Link href={current.href} className="btn-primary inline-block mt-8">
          {current.label}へ
        </Link>
      )}
    </div>
  );
}
