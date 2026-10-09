import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { STATUS_LABEL } from "@/lib/stages";
import { setStatus, createMeeting, updateMeeting, answerQuestion, resolveErrorReport, issueSignInLink, setContractStep } from "../actions";
import { MEETING_LABEL, fmtMeeting, toLocalInput } from "@/lib/meetings";

export default async function CompanyAdmin({ params, searchParams }: PageProps<"/admin/[companyId]">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const issuedLink = typeof sp?.link === "string" ? sp.link : null;
  const linkError = typeof sp?.link_error === "string" ? sp.link_error : null;
  const { supabase } = await requireOperator();
  const [{ data: c }, { data: rows }, { data: reviews }, { data: hw }, { data: qs }, { data: progress }, { data: meetings }, { data: errs }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).single(),
    supabase.from("sheet_rows").select("id, seq, value_raw, experience_value_v1, because_phrase, status, created_by, target_tag, confirmed_at").eq("company_id", companyId).order("seq"),
    supabase.from("sheet_row_reviews").select("action, dwell_ms, before_text, after_text, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("homeworks").select("title, status, priority").eq("company_id", companyId),
    supabase.from("questions_to_operator").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("v_divergence_progress").select("*").eq("company_id", companyId).maybeSingle(),
    supabase.from("company_meetings").select("id, kind, scheduled_at, held_at, meeting_url").eq("company_id", companyId).order("scheduled_at"),
    supabase.from("error_reports").select("id, body, page, user_agent, screenshot_path, created_at, resolved_at, resolved_note").eq("company_id", companyId).order("created_at", { ascending: false }),
  ]);
  const { data: diag } = await supabase.from("diagnosis_results").select("published_at, first_viewed_at, last_viewed_at, view_count").eq("company_id", companyId).maybeSingle();
  if (!c) return null;
  // 開いたら既読にする（未返信は返事するまで残る）
  await Promise.all([
    supabase.from("questions_to_operator").update({ read_at: new Date().toISOString() }).eq("company_id", companyId).is("read_at", null),
    supabase.from("error_reports").update({ read_at: new Date().toISOString() }).eq("company_id", companyId).is("read_at", null),
  ]);
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
      <p className="text-sm text-ink-2 mt-1">{STATUS_LABEL[c.status]} · <Link href={`/admin/${c.id}/diagnosis`} className="underline underline-offset-4 hover:text-ink">適合診断の結果を書く</Link></p>

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
        <h2 className="text-sm text-ink-2">申込・契約・入金（契約書と請求書はメールで）</h2>
        <p className="text-xs text-ink-3 mt-1">お客様が診断結果ページで「申し込む」を押すと申込が入ります。契約書を取り交わしたら「契約済」、入金を確認したら「入金済」を押してください。入金済にすると、お客様がキックオフ日を選べるようになります。候補日は「適合診断の結果を書く」で設定します。</p>
        {diag?.published_at && (
          <p className="text-xs mt-2">
            診断結果：{fmtMeeting(diag.published_at)} 公開 ·{" "}
            {diag.first_viewed_at ? <>お客様が {fmtMeeting(diag.first_viewed_at)} に初めて開きました（閲覧 <span className="num">{diag.view_count}</span> 回、最終 {fmtMeeting(diag.last_viewed_at!)}）</> : <span className="text-warm">まだ開かれていません</span>}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-6 text-sm">
          {([["applied", "申込", c.applied_at], ["contracted", "契約済", c.contracted_at], ["paid", "入金済", c.paid_at]] as const).map(([step, label, at]) => (
            <form key={step} action={setContractStep} className="flex items-center gap-2">
              <input type="hidden" name="company_id" value={c.id} />
              <input type="hidden" name="step" value={step} />
              {at ? (
                <>
                  <span className="font-semibold">{label} ✓</span>
                  <span className="num text-xs text-ink-3">{fmtMeeting(at)}</span>
                  <input type="hidden" name="clear" value="1" />
                  <button className="btn-text text-xs" type="submit">取り消す</button>
                </>
              ) : (
                <button className="btn-text" type="submit">{label}にする</button>
              )}
            </form>
          ))}
        </div>
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
        <h2 className="text-sm text-ink-2">サインインリンクを発行</h2>
        <p className="text-xs text-ink-3 mt-1">メールが届かない担当者に、ベレネッツから直接リンクを渡すためのものです。リンクは1回限り・1時間有効。チャットやメールで本人にだけ送ってください。</p>
        <form action={issueSignInLink} className="mt-2 flex gap-3 items-center">
          <input type="hidden" name="company_id" value={c.id} />
          <input type="email" name="email" required placeholder="担当者のメールアドレス" className="border-b hairline py-1 text-sm num w-80" />
          <button className="btn-text" type="submit">発行</button>
        </form>
        {linkError && <p className="text-xs text-warm mt-2">{linkError}</p>}
        {issuedLink && (
          <div className="mt-3 rounded-[var(--radius)] bg-navy-soft px-4 py-3">
            <p className="text-[11px] text-navy font-semibold">発行しました（この表示を閉じると再表示できません）</p>
            <p className="num text-[12px] break-all mt-1 select-all">{issuedLink}</p>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">面談</h2>
        <ul className="mt-2 divide-y hairline text-sm">
          {(meetings ?? []).map((m) => (
            <li key={m.id} className={`py-3 ${m.held_at ? "text-ink-3" : ""}`}>
              <form action={updateMeeting} className="flex flex-wrap gap-3 items-center">
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="company_id" value={c.id} />
                <span className="w-32">{MEETING_LABEL[m.kind] ?? m.kind}</span>
                <input type="datetime-local" name="scheduled_at" defaultValue={toLocalInput(m.scheduled_at)} className="border-b hairline py-1 num" />
                <input type="url" name="meeting_url" defaultValue={m.meeting_url ?? ""} placeholder="会議URL（Zoom / Meet など）" className="border-b hairline py-1 flex-1 min-w-[260px]" />
                <button className="btn-text" type="submit">保存</button>
                {m.held_at ? <span className="text-xs">実施済 {fmtMeeting(m.held_at)}</span> : (
                  <button className="btn-text" type="submit" name="held" value="1">実施済にする</button>
                )}
              </form>
            </li>
          ))}
        </ul>
        <form action={createMeeting} className="mt-4 flex flex-wrap gap-3 items-center text-sm">
          <input type="hidden" name="company_id" value={c.id} />
          <select name="kind" className="border-b hairline py-1">
            {Object.entries(MEETING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="datetime-local" name="scheduled_at" required className="border-b hairline py-1 num" />
          <input type="url" name="meeting_url" placeholder="会議URL（任意・後から追加可）" className="border-b hairline py-1 flex-1 min-w-[260px]" />
          <button className="btn-primary" type="submit">面談を追加</button>
        </form>
        <p className="text-xs text-ink-3 mt-2">日時は日本時間。URLが空のままだと顧客側に「会議URL未設定」と出ます。</p>
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">提供価値（{(rows ?? []).length}行）</h2>
        <ol className="mt-2 divide-y hairline text-sm">
          {(rows ?? []).map((r) => (
            <li key={r.id} className={`py-2 flex gap-3 ${r.status === "held" ? "text-ink-3" : ""}`}>
              <span className="num w-6 text-ink-3 shrink-0">{r.seq}</span>
              <span className="flex-1 min-w-0">
                <span className="serif block">{r.value_raw}</span>
                {r.experience_value_v1 && <span className="block text-ink-2"><span className="text-[11px] text-ink-3 mr-1">だから</span>{r.experience_value_v1}</span>}
                {r.because_phrase && <span className="block text-ink-2"><span className="text-[11px] text-ink-3 mr-1">なぜなら</span>{r.because_phrase}</span>}
              </span>
              <span className="text-xs text-ink-3 shrink-0">{r.created_by === "ai" ? "AI下書き" : ""}{r.confirmed_at ? " 確定" : ""}{r.status === "held" ? " 保留" : ""}</span>
            </li>
          ))}
        </ol>
      </section>


      <section className="mt-10">
        <h2 className="text-sm text-ink-2">エラーレポート（未対応 {(errs ?? []).filter((e) => !e.resolved_at).length}）</h2>
        <ul className="mt-2 divide-y hairline text-sm">
          {(errs ?? []).map((e) => (
            <li key={e.id} className={`py-3 ${e.resolved_at ? "text-ink-3" : ""}`}>
              <p className="whitespace-pre-line">{e.body}</p>
              <p className="text-xs text-ink-3 mt-1 num">{new Date(e.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}{e.page ? ` · ${e.page}` : ""}</p>
              {e.user_agent && <p className="text-[11px] text-ink-3 num break-all">{e.user_agent}</p>}
              {e.screenshot_path && <a href={`/api/admin/file?path=${encodeURIComponent(e.screenshot_path)}`} target="_blank" rel="noopener" className="text-xs underline underline-offset-4">スクリーンショット</a>}
              {!e.resolved_at ? (
                <form action={resolveErrorReport} className="mt-2 flex gap-3 items-center">
                  <input type="hidden" name="id" value={e.id} /><input type="hidden" name="company_id" value={c.id} />
                  <input name="note" placeholder="対応内容（顧客に表示）" className="border-b hairline py-1 text-sm flex-1 max-w-[48ch]" />
                  <button className="btn-text" type="submit">対応済みにする</button>
                </form>
              ) : <p className="text-xs mt-1">対応済み{e.resolved_note ? `：${e.resolved_note}` : ""}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">質問（未返答 {(qs ?? []).filter((q) => !q.answered_at).length}）</h2>
        <ul className="mt-2 divide-y hairline text-sm">
          {(qs ?? []).map((q) => (
            <li key={q.id} className="py-4">
              <p className="whitespace-pre-line">{q.body}</p>
              <p className="text-xs text-ink-3 mt-1 num">{new Date(q.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>
              <form action={answerQuestion} className="mt-3 max-w-[64ch]">
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="company_id" value={c.id} />
                <textarea name="answered_body" rows={3} defaultValue={q.answered_body ?? ""} placeholder="返事を書く（顧客の質問の直下に表示されます）" className="w-full border-b hairline py-2 text-sm" />
                <div className="flex items-center gap-3 mt-1">
                  <button className="btn-text" type="submit">{q.answered_at ? "返事を更新" : "返事する"}</button>
                  {q.answered_at && <span className="text-xs text-ink-3 num">返答 {new Date(q.answered_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>}
                </div>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
