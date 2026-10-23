import { ClosedStage } from "@/components/ClosedStage";
import { Step0Required } from "@/components/Step0Required";
import { isStep0Ready, loadGateCtx } from "@/server/gates";
import { STAGES, isStageOpen } from "@/lib/stages";
import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { StepGuide } from "@/components/StepGuide";
import { EvidenceBoard, type EvRow, type EvClaim, type Ev } from "@/components/EvidenceBoard";
import { stepGate } from "@/lib/gates";
import { requireCustomer, isMember } from "@/lib/session";
import { loadFixedText } from "@/server/ai/client";
import { requestEvidenceCandidates } from "./actions";
import { lastAiError } from "@/server/aiGuard";
import { AiNotice } from "@/components/AiNotice";
import { EVIDENCE_KINDS, buildClaims, triedKey } from "@/lib/evidence";

export const maxDuration = 300; // AIが資料から候補を探す時間を取る

export default async function Page() {
  const { supabase, company, profile } = await requireCustomer();
  const member = isMember(profile);
  const stage = STAGES.find((x) => x.key === "evidence")!;
  if (!isStageOpen(stage, company.status)) return <ClosedStage stageKey="evidence" status={company.status} />;
  if (!(await isStep0Ready(supabase, company.id))) return <Step0Required stageKey="evidence" />;
  const [{ data: rows }, { data: brakes }, { data: evs, error: evErr }, ctx, fixed, { data: tried }] = await Promise.all([
    supabase.from("sheet_rows").select("id, seq, rank, is_primary, value_raw, experience_value, experience_value_v1, because_phrase, because_tag").eq("company_id", company.id).eq("status", "active"),
    supabase.from("brakes").select("id, row_id, kind, customer_words, counter_message, because, because_tag, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id).eq("status", "active").order("created_at"),
    supabase.from("evidences").select("id, row_id, what, content, kind, source, strength, status, claim_ref, created_by, created_at, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", company.id).order("created_at"),
    loadGateCtx(supabase, company.id, company.status),
    loadFixedText("round3_evidence_intro"),
    supabase.from("activity_log").select("payload").eq("company_id", company.id).eq("event", "evidence.draft"),
  ]);
  const gate = stepGate("evidence", ctx);
  const aiErr = await lastAiError(supabase, company.id, "evidence.draft");
  const loadErr = evErr ? `証拠を読み込めませんでした${/status|claim_ref|created_by/.test(evErr.message) ? "（SQL 0041 が未実行の可能性があります）" : ""}：${evErr.message}` : null;

  // 並びは、確認セッション②で確定した順位の順。順位の無い組はそのあとに番号順
  const list: EvRow[] = (rows ?? []).filter((r) => r.value_raw)
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.seq - b.seq)
    .map((r) => {
      const claims: EvClaim[] = buildClaims(r, (brakes ?? []).filter((b) => b.row_id === r.id));
      return { id: r.id, seq: r.seq, rank: r.rank, primary: r.is_primary, value: r.value_raw as string, experience: r.experience_value ?? r.experience_value_v1, claims };
    });
  const evList = (evs ?? []) as unknown as Ev[];
  const adoptedRows = new Set(evList.filter((e) => e.status === "adopted").map((e) => e.row_id));
  const withEv = list.filter((r) => adoptedRows.has(r.id)).length;
  const candidates = evList.filter((e) => e.status === "candidate").length;
  const triedIds = new Set((tried ?? []).flatMap((t) => ((t.payload as { tried?: string[] } | null)?.tried ?? [])));
  const anyEv = new Set(evList.map((e) => e.row_id));
  const searchable = list.filter((r) => r.claims.length > 0 && !anyEv.has(r.id) && !triedIds.has(triedKey(r.id, r.claims))).length;

  return (
    <div>
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 sm:gap-8">
        <div>
          <h1 className="serif text-[28px] leading-tight">{stage.label}</h1>
          <p className="text-ink-2 text-sm mt-2 max-w-[40em]">
            {list.length === 0 ? "まだ組がありません。" : withEv === list.length ? "すべての組に証拠がつきました。" : `証拠がまだ無い組が${list.length - withEv}組あります。順位の高い組から集めてください。`}
          </p>
        </div>
        <div className="sm:text-right shrink-0 serif leading-none">
          <span className="text-[56px]">{withEv}</span>
          <span className="text-[20px] text-ink-3"> / {list.length}<span className="text-[13px] font-normal ml-1">組に証拠</span></span>
        </div>
      </header>
      <StepGuide stageKey="evidence" />
      <div className="mt-3"><ExportButton stageKey="evidence" /></div>

      {fixed && <p className="mt-8 text-sm text-ink-2 leading-relaxed border-l-2 hairline pl-4 max-w-[40em] whitespace-pre-line">{fixed}</p>}

      <section className="mt-8 max-w-[1100px]">
        <h2 className="serif text-[18px]">証拠の強さ</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-4 text-[13px]">
          {EVIDENCE_KINDS.map((k, i) => (
            <li key={k.key} className="rounded-[var(--radius)] border hairline px-3 py-2"><span className="num text-ink-3 mr-1.5">{i + 1}</span>{k.label}</li>
          ))}
        </ol>
        <AiNotice message={loadErr ?? aiErr} />
        {searchable > 0 ? (
          <form action={requestEvidenceCandidates} className="mt-5" data-busy-timeout="300000">
            <button className="btn-primary" type="submit">{searchable > 6 ? `証拠がまだ無い${searchable}組のうち、まず6組の候補をAIに探してもらう` : `証拠がまだ無い${searchable}組の候補を、AIに探してもらう`}</button>
            <p className="text-[12px] text-ink-3 mt-2">会社の資料・面談の記録・適合診断の中から、「なぜなら」を裏づけそうな箇所をそのまま抜き出します。材料に無いことは作りません。採用するかどうかは御社が決めます。</p>
          </form>
        ) : list.length > 0 && (
          <p className="mt-5 text-[12px] text-ink-3">{candidates > 0 ? `証拠の候補が${candidates}件あります。下の組ごとに、${member ? "担当者が" : ""}採用するか見送るかを決めてください。` : (list.some((r) => r.claims.length > 0) ? "AIが探せる組は探し終えました。見つからなかった組は、お客様の声や数字を集めて、下の「証拠を足す」から入れてください。" : "AIが探すには、組に「なぜなら」（STEP 4・5）が必要です。先に STEP 4・5 で書くか、下の「証拠を足す」から入れてください。")}</p>
        )}
      </section>

      <section className="mt-10 max-w-[1100px]">
        <EvidenceBoard rows={list} evidences={evList} />
      </section>

      <NextStepBar gate={gate} />
    </div>
  );
}
