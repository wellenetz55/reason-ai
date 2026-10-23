import { requireCustomer } from "@/lib/session";
import { recordDiagnosisView } from "./actions";
import { DiagnosisView } from "@/components/DiagnosisView";
import { loadKickoff } from "@/server/kickoff";

export default async function DiagnosisPage() {
  const { supabase, company } = await requireCustomer();
  const { data: d } = await supabase.from("diagnosis_results").select("company_id, one_liner_before, seeds, brakes, fit_reasons, competitor, candidate_dates, operator_note, chosen_date, chosen_at, published_at, expires_at, updated_at, summary").eq("company_id", company.id).maybeSingle();
  if (!d) {
    return (
      <div>
        <h1 className="serif text-[28px] leading-tight">適合診断の結果</h1>
        <p className="text-sm text-ink-2 mt-3">まだ公開されていません。ベレネッツからの案内をお待ちください。</p>
      </div>
    );
  }
  const [kickoff] = await Promise.all([loadKickoff(company.id), recordDiagnosisView()]);
  return <DiagnosisView company={company} d={d} kickoff={kickoff} />;
}
