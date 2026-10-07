import { requireOperator } from "@/lib/session";
import { STATUS_LABEL } from "@/lib/stages";
import { setStatus } from "../actions";

export default async function CompanyAdmin({ params }: PageProps<"/admin/[companyId]">) {
  const { companyId } = await params;
  const { supabase } = await requireOperator();
  const [{ data: c }, { data: rows }, { data: reviews }, { data: hw }, { data: qs }, { data: progress }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).single(),
    supabase.from("sheet_rows").select("id, seq, value_raw, status, created_by, target_tag").eq("company_id", companyId).order("seq"),
    supabase.from("sheet_row_reviews").select("action, dwell_ms, before_text, after_text, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("homeworks").select("title, status, priority").eq("company_id", companyId),
    supabase.from("questions_to_operator").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("v_divergence_progress").select("*").eq("company_id", companyId).maybeSingle(),
  ]);
  if (!c) return null;
  const approves = (reviews ?? []).filter((r) => r.action === "approve").length;
  const fixes = (reviews ?? []).filter((r) => r.action === "fix").length;
  const fixChars = (reviews ?? []).filter((r) => r.action === "fix").reduce((a, r) => a + Math.abs((r.after_text?.length ?? 0) - (r.before_text?.length ?? 0)), 0);
  const fastApproves = (reviews ?? []).filter((r) => r.action === "approve" && (r.dwell_ms ?? 1e9) < 5000).length;
  const hypoApproved = (rows ?? []).filter((r) => r.target_tag?.includes("仮説") && r.created_by === "customer").length;
  const openHw = (hw ?? []).filter((h) => h.status === "open").length;
  const passedHw = (hw ?? []).filter((h) => h.status === "passed").length;
  const signals: string[] = [];
  if (approves >= 10 && fixes === 0) signals.push(`${approves}件を修正なしで承認`);
  if (fixes > 0 && fixChars <= fixes * 2) signals.push("修正が句読点程度");
  if (fastApproves >= 5) signals.push(`${fastApproves}件を5秒未満で承認`);
  if (hypoApproved >= 5) signals.push(`仮説${hypoApproved}件をそのまま承認`);
  if (passedHw >= 3) signals.push(`宿題を${passedHw}件パス`);

  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">{c.name}</h1>
      <p className="text-sm text-ink-2 mt-1">{STATUS_LABEL[c.status]}</p>

      <section className="mt-8 grid grid-cols-4 gap-6 text-sm">
        <div><p className="text-xs text-ink-3">行数</p><p className="serif text-[28px]">{progress?.row_count ?? 0}</p></div>
        <div><p className="text-xs text-ink-3">承認 / 修正</p><p className="serif text-[28px]">{approves} / {fixes}</p></div>
        <div><p className="text-xs text-ink-3">未回収宿題</p><p className="serif text-[28px]">{openHw}</p></div>
        <div><p className="text-xs text-ink-3">質問</p><p className="serif text-[28px]">{(qs ?? []).filter((q) => !q.answered_at).length}</p></div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">姿勢シグナル</h2>
        {signals.length === 0 ? <p className="text-sm text-ink-3 mt-2">該当なし</p> : (
          <p className="mt-2 text-sm">{signals.length}つが重なっています：{signals.join("／")}</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">状態を変える</h2>
        <form action={setStatus} className="mt-2 flex gap-3 items-center">
          <input type="hidden" name="company_id" value={c.id} />
          <select name="status" defaultValue={c.status} className="border-b hairline py-1 text-sm">
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-text" type="submit">変更</button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">提供価値（{(rows ?? []).length}行）</h2>
        <ol className="mt-2 divide-y hairline text-sm">
          {(rows ?? []).map((r) => (
            <li key={r.id} className={`py-2 flex gap-3 ${r.status === "held" ? "text-ink-3" : ""}`}>
              <span className="num w-6 text-ink-3">{r.seq}</span>
              <span className="serif">{r.value_raw}</span>
              <span className="text-xs text-ink-3 ml-auto">{r.created_by === "ai" ? "AI下書き" : ""}{r.status === "held" ? " 保留" : ""}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">質問</h2>
        <ul className="mt-2 divide-y hairline text-sm">
          {(qs ?? []).map((q) => <li key={q.id} className="py-2"><p className="whitespace-pre-line">{q.body}</p>{q.answered_body && <p className="text-ink-2 mt-1">→ {q.answered_body}</p>}</li>)}
        </ul>
      </section>
    </div>
  );
}
