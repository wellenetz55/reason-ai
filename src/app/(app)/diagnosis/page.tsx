import { requireCustomer } from "@/lib/session";
import { recordDiagnosisView } from "./actions";
import { DiagnosisView } from "@/components/DiagnosisView";

export default async function DiagnosisPage() {
  const { supabase, company } = await requireCustomer();
  const { data: d } = await supabase.from("diagnosis_results").select("*").eq("company_id", company.id).maybeSingle();
  if (!d) {
    return (
      <div>
        <h1 className="serif text-[28px] leading-tight">適合診断の結果</h1>
        <p className="text-sm text-ink-2 mt-3">まだ公開されていません。ベレネッツからの案内をお待ちください。</p>
      </div>
    );
  }
  await recordDiagnosisView();
  return <DiagnosisView company={company} d={d} />;
}
