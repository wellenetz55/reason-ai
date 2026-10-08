import Link from "next/link";
import { requireCustomer } from "@/lib/session";
import { STAGES, currentStep } from "@/lib/stages";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("ja-JP", { hour: "numeric", hour12: false, timeZone: "Asia/Tokyo" }).format(new Date()));
  if (h >= 5 && h < 10) return "おはようございます";
  if (h >= 10 && h < 17) return "こんにちは";
  return "こんばんは";
}

export default async function Home() {
  const { company, supabase } = await requireCustomer();
  const [{ data: progress }, { count: openHomework }] = await Promise.all([
    supabase.from("v_divergence_progress").select("row_count").eq("company_id", company.id).maybeSingle(),
    supabase.from("homeworks").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "open"),
  ]);
  const rows = progress?.row_count ?? 0;
  const step = currentStep(company.status, rows);
  const stage = STAGES.find((s) => s.key === step.key);

  return (
    <div>
      <h1 className="serif text-[30px] leading-tight">{company.name}様、{greeting()}。</h1>

      <section className="mt-12">
        <p className="text-[13px] text-ink-3">いま進めること</p>
        <h2 className="serif text-[22px] mt-1">{step.title}</h2>
        <p className="text-ink-2 mt-2 max-w-[56ch] leading-relaxed">{step.body}</p>
        {stage && (
          <Link href={stage.href} className="btn-primary inline-block mt-6">
            {step.title}へ
          </Link>
        )}
      </section>

      {(openHomework ?? 0) > 0 && (
        <section className="mt-12">
          <p className="text-[13px] text-ink-3">宿題</p>
          <p className="mt-1">
            未回答の宿題が <span className="num">{openHomework}</span> 件あります。{" "}
            <Link href="/homework" className="underline underline-offset-4">宿題を見る</Link>
          </p>
        </section>
      )}
    </div>
  );
}
