import Link from "next/link";
import { redirect } from "next/navigation";
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
  if (company.status === "diagnosed") redirect("/diagnosis");
  const [{ data: progress }, { data: hw }] = await Promise.all([
    supabase.from("v_divergence_progress").select("pair_count").eq("company_id", company.id).maybeSingle(),
    supabase.from("homeworks").select("id, title, why, due_at, priority").eq("company_id", company.id).eq("status", "open").order("priority", { ascending: false }).order("due_at").limit(3),
  ]);
  const openHomework = hw?.length ?? 0;
  const rows = progress?.pair_count ?? 0;
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
        <p className="text-[13px] text-ink-3 mt-6 max-w-[56ch] leading-relaxed">
          ステップは STEP 0 から順に進みます。各画面のいちばん下に「次のステップ」があり、条件を満たすとボタンが押せます。ベレネッツとの面談のあとに開くステップもあります。
        </p>
      </section>

      {openHomework > 0 && (
        <section className="mt-12 rounded-[var(--radius)] bg-navy-soft px-6 py-5 max-w-[64ch]">
          <p className="text-[11px] font-semibold tracking-wide text-navy">宿題 · 次の面談までに</p>
          <p className="text-sm text-ink-2 mt-1">シートの「仮説」を事実に変えるために、御社に調べてもらうことです。一人で決めず、周りの人に聞いてから書いてください。</p>
          <ul className="mt-3 space-y-2">
            {hw!.map((h) => (
              <li key={h.id} className="text-sm">
                <span className="text-hypo text-xs mr-2">{"★".repeat(h.priority)}</span>
                <span>{h.title}</span>
                {h.due_at && <span className="num text-[12px] text-ink-3 ml-2">期限 {new Date(h.due_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })}</span>}
                {h.why && <span className="block text-[12px] text-ink-3 ml-7">効く場所：{h.why}</span>}
              </li>
            ))}
          </ul>
          <Link href="/homework" className="btn-primary inline-block mt-4">宿題を見る</Link>
        </section>
      )}
    </div>
  );
}
