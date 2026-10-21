import { notFound } from "next/navigation";
import Link from "next/link";
import { ClearIssuedLink } from "@/components/ClearIssuedLink";
import { requireOperator } from "@/lib/session";
import { STATUS_LABEL } from "@/lib/stages";
import { setStatus, setReaccess, setPhaseEnd, resolveAlert, createMeeting, updateMeeting, answerQuestion, resolveErrorReport, issueSignInLink, setContractStep, inviteCustomer } from "../actions";
import { MEETING_LABEL, ADVANCE_AFTER_MEETING, fmtMeeting, toLocalInput } from "@/lib/meetings";
import { createHomework, updateHomework, withdrawHomework, reopenHomework } from "./homework-actions";
import { ClearQuery } from "@/components/ClearQuery";
import { loadKickoff } from "@/server/kickoff";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadIntake, describeTarget, VERDICT_LABEL, inviteGate } from "@/server/intake";

const HW_OK: Record<string, string> = { created: "宿題を出しました。お客様の左メニューと「宿題」画面に表示されます。", updated: "宿題を直しました。", withdrawn: "宿題を取り下げました。", reopened: "宿題をもう一度出しました（前の回答は残しています）。" };
const toDateInput = (iso: string) => toLocalInput(iso).slice(0, 10);

export default async function CompanyAdmin({ params, searchParams }: PageProps<"/admin/[companyId]">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const issuedLink = sp?.link === "1" ? (jar.get("issued_link")?.value ?? null) : null;
  const memberError = typeof sp?.member_error === "string" ? sp.member_error : null;
  const memberOk = sp?.member_ok === "1";
  const linkError = typeof sp?.link_error === "string" ? sp.link_error : null;
  const hwOk = typeof sp?.hw_ok === "string" ? HW_OK[sp.hw_ok] ?? null : null;
  const statusError = typeof sp?.status_error === "string" ? sp.status_error : null;
  const statusOk = typeof sp?.status_ok === "string" ? sp.status_ok : null;
  const hwError = typeof sp?.hw_error === "string" ? sp.hw_error : null;
  const { supabase, isSuper } = await requireOperator();
  const [{ data: c }, { data: rows }, { data: reviews }, { data: hw }, { data: qs }, { data: progress }, { data: meetings }, { data: errs }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).single(),
    supabase.from("sheet_rows").select("id, seq, value_raw, experience_value_v1, experience_value, because_phrase, status, created_by, target_tag, confirmed_at").eq("company_id", companyId).order("seq"),
    supabase.from("sheet_row_reviews").select("action, dwell_ms, before_text, after_text, created_at, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId).order("created_at", { ascending: false }).limit(200),
    supabase.from("homeworks").select("id, title, why, ask_whom_hint, due_at, status, priority, answer, pass_reason, asked_whom, answered_at, created_at").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("questions_to_operator").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("v_divergence_progress").select("*").eq("company_id", companyId).maybeSingle(),
    supabase.from("company_meetings").select("id, kind, scheduled_at, held_at, meeting_url").eq("company_id", companyId).order("scheduled_at"),
    supabase.from("error_reports").select("id, body, page, user_agent, screenshot_path, created_at, resolved_at, resolved_note").eq("company_id", companyId).order("created_at", { ascending: false }),
  ]);
  // 1回の往復でまとめて読む（順番に待つと会社が増えたときに遅くなる）
  const [{ data: members }, intake, { data: openAlerts }, gate, { data: diag }, kickoff] = await Promise.all([
    supabase.from("profiles").select("id, display_name, role, created_at").eq("company_id", companyId).order("created_at"),
    loadIntake(companyId).catch(() => null),
    supabase.from("alerts").select("id, kind, payload, created_at").eq("company_id", companyId).is("resolved_at", null).order("created_at", { ascending: false }),
    c ? inviteGate(companyId, c.status) : Promise.resolve({ ok: false, reason: "" }),
    supabase.from("diagnosis_results").select("published_at, first_viewed_at, last_viewed_at, view_count, chosen_at").eq("company_id", companyId).maybeSingle(),
    loadKickoff(companyId),
  ]);
  // メールアドレスは、この会社の担当者の分だけ取る（全ユーザー一覧は読まない）
  const adminAuth = (await import("@/lib/supabase/admin")).createAdminClient().auth.admin;
  const emails = Object.fromEntries(await Promise.all((members ?? []).map(async (m) => [m.id, (await adminAuth.getUserById(m.id)).data.user?.email ?? ""] as const)));
  const emailOf = (id: string) => emails[id] ?? "";
  const ALERT_LABEL: Record<string, string> = { stale7: "7日操作なし", escalation: "要対応", homework_overdue: "宿題の期限超過", attitude_flag: "姿勢シグナル", disclosure_request: "開示要求", quota_reached: "生成上限", grace_ending: "猶予終了間近", extension_ending: "延長終了間近", no_internal_meeting: "社内打合せ未登録" };
  const alertText = (a: { kind: string; payload: unknown }) => { const pl = a.payload as { type?: string; kind?: string } | null; const t = pl?.type; if (t === "meeting_chosen") return `${MEETING_LABEL[pl?.kind ?? ""] ?? "面談"}の日程が選ばれました。会議URLを入れてください`; if (t === "dates_declined") return `${MEETING_LABEL[pl?.kind ?? ""] ?? "面談"}の候補日がすべて合いませんでした。下の「面談」に新しい候補日を3つほど登録してください`; return t === "program_applied" ? "申込がありました" : t === "step2_done" ? "まとめて絞るが終わりました。確認セッション①の日程を登録してください" : t === "kickoff_chosen" ? "キックオフ日が選ばれました" : t === "diagnosis_viewed" ? "診断結果を開きました" : ALERT_LABEL[a.kind] ?? a.kind; };
  if (!c) notFound();
  // 面談の記録があるか（ボタンの文言用。表が無ければ空）
  const { data: recs } = await createAdminClient().from("meeting_records").select("meeting_id").eq("company_id", companyId);
  const recordIds = new Set((recs ?? []).map((r) => r.meeting_id as string));
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
  if (hypoApproved >= 5) signals.push(`「仮説」のままの組が${hypoApproved}件`);
  if (passedHw >= 3) signals.push(`宿題を${passedHw}件パス`);

  return (
    <div>
      <ClearQuery keys={["member_ok", "member_error", "link_error", "hw_ok", "hw_error", "status_error", "status_ok"]} />
      {statusOk && <p className="mt-4 rounded-[var(--radius)] bg-navy-soft px-4 py-3 text-sm max-w-[44em]">{statusOk}</p>}
      {Object.entries(ADVANCE_AFTER_MEETING).map(([kind, rule]) => rule.from.includes(c.status) && (meetings ?? []).some((m) => m.kind === kind && m.held_at) ? (
        <form key={kind} action={setStatus} className="mt-4 rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-5 py-4 max-w-[44em] flex flex-wrap items-center gap-3">
          <input type="hidden" name="company_id" value={c.id} />
          <input type="hidden" name="status" value={rule.to} />
          <p className="text-sm flex-1 min-w-[260px]"><span className="font-semibold text-warm">{MEETING_LABEL[kind]}は実施済ですが、状態が「{STATUS_LABEL[c.status]}」のままです。</span>お客様側では次のステップがまだ開いていません。</p>
          <button className="btn-primary" type="submit">「{STATUS_LABEL[rule.to]}」に進める</button>
        </form>
      ) : null)}
      <h1 className="serif text-[28px] leading-tight">{c.name}</h1>
      <p className="text-sm text-ink-2 mt-1">{STATUS_LABEL[c.status]} · <Link href={`/admin/${c.id}/intake`} className="underline underline-offset-4 hover:text-ink">適合診断の記録</Link> · <Link href={`/admin/${c.id}/diagnosis`} className="underline underline-offset-4 hover:text-ink">適合診断の結果を書く</Link></p>
      <p className="text-xs text-ink-3 mt-1">
        {intake ? <>{intake.held_on && <>診断日 <span className="num">{new Date(intake.held_on + "T00:00:00+09:00").toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" })}</span> · </>}対象：{describeTarget(intake, c.name) || "会社全体"}{intake.transcript_name ? " · 書き起こしあり" : " · 書き起こしなし"}{intake.verdict ? ` · 判定 ${VERDICT_LABEL[intake.verdict] ?? intake.verdict}` : ""}</> : <span className="text-warm">適合診断の記録がまだありません（対象・URL・聞き取りを入れると、AIの下書きがそれを使います）</span>}
      </p>

      <section className="mt-8 grid grid-cols-4 gap-6 text-sm">
        <div><p className="text-xs text-ink-3">行数</p><p className="serif text-[28px]">{progress?.row_count ?? 0}</p></div>
        <div><p className="text-xs text-ink-3">承認 / 修正</p><p className="serif text-[28px]">{approves} / {fixes}</p></div>
        <div><p className="text-xs text-ink-3">未回収宿題</p><p className="serif text-[28px]">{openHw}</p></div>
        <div><p className="text-xs text-ink-3">質問</p><p className="serif text-[28px]">{(qs ?? []).filter((q) => !q.answered_at).length}</p></div>
      </section>

      {(openAlerts ?? []).length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm text-ink-2">要対応（{(openAlerts ?? []).length}）</h2>
          <ul className="mt-2 divide-y divide-hair text-sm max-w-[880px]">
            {(openAlerts ?? []).map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>{alertText(a)}</span>
                <span className="num text-xs text-ink-3">{fmtMeeting(a.created_at)}</span>
                <form action={resolveAlert} className="ml-auto"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="company_id" value={c.id} /><button className="btn-text text-xs" type="submit">済みにする</button></form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">姿勢シグナル</h2>
        {signals.length === 0 ? <p className="text-sm text-ink-3 mt-2">該当なし</p> : (
          <p className="mt-2 text-sm">{signals.length >= 2 ? `${signals.length}つが重なっています：` : "注意："}{signals.join("／")}</p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">申込・契約・入金（契約書と請求書はメールで）</h2>
        <p className="text-xs text-ink-3 mt-1">お客様が診断結果ページで「申し込む」を押すと申込が入ります。契約書を取り交わしたら「契約済」、入金を確認したら「入金済」を押してください。入金済にすると、お客様にメールが届き、キックオフ日を候補（最大3つ）から選べるようになります。候補日は「適合診断の結果を書く」の 6. に入れるか、下の「面談」にキックオフを複数登録してください（どちらも候補として出ます。未来の日だけ有効。面談に1件だけ入れると、その日で確定として扱います）。</p>
        {c.status === "diagnosed" && c.paid_at && !kickoff.chosen && kickoff.candidates.length === 0 && (
          <p className="mt-2 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-2.5 text-[13px]">入金済ですが、これからのキックオフ候補日がありません。お客様には「候補日はベレネッツからご連絡します」と出ています。「適合診断の結果を書く」の 6. か、下の「面談」で未来の日を入れてください。</p>
        )}
        {c.status === "diagnosed" && kickoff.chosen && <p className="mt-2 text-[13px]">キックオフ：<span className="num font-semibold">{fmtMeeting(kickoff.chosen)}</span>{diag?.chosen_at ? "（お客様が選択）" : "（面談の登録から確定）"}</p>}
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

      <section id="homework" className="mt-10 scroll-mt-6">
        <h2 className="text-sm text-ink-2">宿題（未回答 {openHw}）</h2>
        <p className="text-xs text-ink-3 mt-1">出すとすぐ、お客様の左メニュー（フェーズの下）と「宿題」画面に出ます。お客様は「誰に聞いたか」を必ず書いて回答するか、理由を書いてパスします。期限はその日の23:59（日本時間）です。</p>
        {["diagnosed", "locked", "cancelled"].includes(c.status) && <p className="text-xs text-warm mt-1">いまの状態（{STATUS_LABEL[c.status]}）では、お客様の左メニューに宿題は出ません。</p>}
        <form action={createHomework} className="mt-3 grid gap-2 max-w-[44em] text-sm">
          <input type="hidden" name="company_id" value={c.id} />
          <input name="title" required placeholder="宿題（例：最近の受注3件、決め手を営業担当に聞いてください）" className="border-b hairline py-1" />
          <input name="why" placeholder="効く場所（任意。例：STEP 5 の「なぜなら」の裏づけ）" className="border-b hairline py-1" />
          <input name="ask_whom_hint" placeholder="誰に聞くか（任意。「まず○○に聞いてください」と出ます。例：営業担当）" className="border-b hairline py-1" />
          <div className="flex flex-wrap gap-4 items-center">
            <label className="flex items-center gap-2 text-xs text-ink-3">期限<input type="date" name="due_at" className="border-b hairline py-1 num text-sm text-ink" /></label>
            <label className="flex items-center gap-2 text-xs text-ink-3">大事さ
              <select name="priority" defaultValue="2" className="border-b hairline py-1 text-sm text-ink">
                <option value="3">★★★</option><option value="2">★★</option><option value="1">★</option>
              </select>
            </label>
            <button className="btn-primary" type="submit">宿題を出す</button>
          </div>
        </form>
        {hwError && <p className="text-xs text-warm mt-2">{hwError}</p>}
        {hwOk && <p className="text-xs text-navy mt-2">{hwOk}</p>}
        {(hw ?? []).length > 0 && (
          <ul className="mt-4 divide-y divide-hair text-sm">
            {(hw ?? []).map((h) => {
              const overdueHw = h.status === "open" && h.due_at && new Date(h.due_at) < new Date();
              return (
                <li key={h.id} className="py-3">
                  {h.status === "open" ? (
                    <details>
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex flex-wrap items-baseline gap-x-3">
                        <span className="text-hypo text-xs">{"★".repeat(h.priority)}</span>
                        <span>{h.title}</span>
                        <span className={`num text-xs ${overdueHw ? "text-warm font-semibold" : "text-ink-3"}`}>{h.due_at ? `期限 ${toDateInput(h.due_at)}${overdueHw ? "（過ぎています）" : ""}` : "期限なし"}</span>
                        <span className="text-xs text-ink-3">未回答 · 直す ▾</span>
                      </summary>
                      <form action={updateHomework} className="mt-2 grid gap-2 max-w-[44em]">
                        <input type="hidden" name="id" value={h.id} /><input type="hidden" name="company_id" value={c.id} />
                        <input name="title" required defaultValue={h.title} className="border-b hairline py-1" />
                        <input name="why" defaultValue={h.why ?? ""} placeholder="効く場所（任意）" className="border-b hairline py-1" />
                        <input name="ask_whom_hint" defaultValue={h.ask_whom_hint ?? ""} placeholder="誰に聞くか（任意）" className="border-b hairline py-1" />
                        <div className="flex flex-wrap gap-4 items-center">
                          <input type="date" name="due_at" defaultValue={h.due_at ? toDateInput(h.due_at) : ""} className="border-b hairline py-1 num" />
                          <select name="priority" defaultValue={String(h.priority)} className="border-b hairline py-1">
                            <option value="3">★★★</option><option value="2">★★</option><option value="1">★</option>
                          </select>
                          <button className="btn-text" type="submit">保存</button>
                        </div>
                      </form>
                      <form action={withdrawHomework} className="mt-2">
                        <input type="hidden" name="id" value={h.id} /><input type="hidden" name="company_id" value={c.id} />
                        <button className="btn-text text-xs text-ink-3" type="submit">この宿題を取り下げる</button>
                      </form>
                    </details>
                  ) : (
                    <div className="text-ink-2">
                      <p className="flex flex-wrap items-baseline gap-x-3">
                        <span className="text-xs">{h.status === "passed" ? "パス" : "回答済み"}</span>
                        <span className="text-ink">{h.title}</span>
                        {h.answered_at && <span className="num text-xs text-ink-3">{fmtMeeting(h.answered_at)}</span>}
                      </p>
                      {(h.answer || h.pass_reason) && <p className="mt-1 whitespace-pre-line">{h.status === "passed" ? `パスの理由：${h.pass_reason ?? ""}` : h.answer}</p>}
                      {h.asked_whom && <p className="text-xs text-ink-3 mt-1">聞いた相手：{h.asked_whom}</p>}
                      <form action={reopenHomework} className="mt-1">
                        <input type="hidden" name="id" value={h.id} /><input type="hidden" name="company_id" value={c.id} />
                        <button className="btn-text text-xs" type="submit">もう一度出す（回答が足りないとき）</button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
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
        {(c.status === "grace" || c.status === "extended") && (() => {
          const col = c.status === "grace" ? "grace_until" : "extension_until";
          const until = c.status === "grace" ? c.grace_until : c.extension_until;
          return (
            <form action={setPhaseEnd} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <input type="hidden" name="company_id" value={c.id} />
              <input type="hidden" name="col" value={col} />
              <span className="text-xs text-ink-3">{c.status === "grace" ? "猶予の終わり（過ぎると「編集終了」に）" : "延長の終わり（過ぎると「顧問」に）"}</span>
              <input type="date" name="until" required defaultValue={until ? toLocalInput(until).slice(0, 10) : ""} className="border-b hairline py-1 num" />
              <button className="btn-text" type="submit">保存</button>
              {!until && <span className="text-xs text-warm">未設定です。日付を入れてください</span>}
            </form>
          );
        })()}
        {c.status === "cancelled" && (
          <div className="mt-4 rounded-[var(--radius)] bg-paper-2 px-4 py-3 text-sm max-w-[44em]">
            <p className="font-semibold text-[13px]">解約後のデータへの再アクセス</p>
            <p className="text-xs text-ink-3 mt-1">お客様から連絡があったときに、期限付きで提供価値シートのダウンロードを戻します（編集はできません）。期限が来ると自動で閉じます。状態は「解約」のままです。</p>
            {c.reaccess_until && new Date(c.reaccess_until) > new Date() ? (
              <form action={setReaccess} className="mt-2 flex flex-wrap items-center gap-3">
                <input type="hidden" name="company_id" value={c.id} />
                <span className="text-navy text-[13px]"><span className="num">{fmtMeeting(c.reaccess_until)}</span> までダウンロードできます</span>
                <input type="hidden" name="days" value="0" />
                <button className="btn-text text-xs" type="submit">いま閉じる</button>
              </form>
            ) : (
              <form action={setReaccess} className="mt-2 flex flex-wrap items-center gap-3">
                <input type="hidden" name="company_id" value={c.id} />
                <select name="days" defaultValue="14" className="border-b hairline py-1 text-sm">
                  <option value="7">7日間</option><option value="14">14日間</option><option value="30">30日間</option>
                </select>
                <button className="btn-text" type="submit">ダウンロードを許可する</button>
              </form>
            )}
          </div>
        )}
        {statusError && <p className="text-xs text-warm mt-2">{statusError}</p>}
      </section>



      <section className="mt-10">
        <h2 className="text-sm text-ink-2">担当者</h2>
        <p className="text-xs text-ink-3 mt-1">この会社でサインインできる人です。追加すると招待メール（日本語）が届きます。最初の1人が主担当になります。</p>
        {(members ?? []).length > 0 && (
          <ul className="mt-3 text-sm space-y-1">
            {(members ?? []).map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <span>{m.display_name || "（名前未設定）"}</span>
                <span className="num text-xs text-ink-3">{emailOf(m.id)}</span>
                <span className="text-[11px] text-ink-3">{m.role === "customer_admin" ? "主担当" : "担当者"}</span>
              </li>
            ))}
          </ul>
        )}
        {gate.ok ? (
          <form action={inviteCustomer} className="mt-3 flex flex-wrap gap-3 items-center">
            <input type="hidden" name="company_id" value={c.id} />
            <input type="email" name="email" required placeholder="メールアドレス" className="border-b hairline py-1 text-sm num w-72" />
            <input name="display_name" placeholder="お名前（任意）" className="border-b hairline py-1 text-sm w-40" />
            <button className="btn-primary" type="submit">追加して招待する</button>
          </form>
        ) : (
          <p className="mt-3 rounded-[var(--radius)] bg-paper-2 px-4 py-3 text-[13px] text-ink-2 max-w-[44em]">
            {gate.reason}。<Link href={`/admin/${c.id}/intake`} className="underline underline-offset-4 ml-1">適合診断の記録へ</Link>
          </p>
        )}
        {memberError && <p className="text-xs text-warm mt-2">{memberError}</p>}
        {memberOk && <p className="text-xs text-navy mt-2">招待メールを送りました。</p>}
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">サインインリンクを発行</h2>
        <p className="text-xs text-ink-3 mt-1">メールが届かない担当者に、ベレネッツから直接リンクを渡すためのものです。リンクは1回限り・5分有効（Supabaseの設定に連動）。チャットやメールで本人にだけ送ってください。</p>
        <form action={issueSignInLink} className="mt-2 flex gap-3 items-center">
          <input type="hidden" name="company_id" value={c.id} />
          <input type="email" name="email" required placeholder="担当者のメールアドレス" className="border-b hairline py-1 text-sm num w-80" />
          <button className="btn-text" type="submit">発行</button>
        </form>
        {linkError && <p className="text-xs text-warm mt-2">{linkError}</p>}
        {issuedLink && <ClearIssuedLink companyId={c.id} />}
        {issuedLink && (
          <div className="mt-3 rounded-[var(--radius)] bg-navy-soft px-4 py-3">
            <p className="text-[11px] text-navy font-semibold">発行しました（この画面を離れると消えます。いまコピーして、本人にだけ送ってください）</p>
            <p className="num text-[12px] break-all mt-1 select-all">{issuedLink}</p>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">面談</h2>
        {(meetings ?? []).length === 0 && <p className="text-sm text-ink-3 mt-2">まだ面談は登録されていません。下の欄から追加します。</p>}
        <ul className="mt-2 divide-y divide-hair text-sm">
          {(meetings ?? []).map((m) => (
            <li key={m.id} className={`py-3 ${m.held_at ? "text-ink-3" : ""}`}>
              <form action={updateMeeting} className="flex flex-wrap gap-3 items-center">
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="company_id" value={c.id} />
                <span className="w-32">{MEETING_LABEL[m.kind] ?? m.kind}</span>
                <input type="datetime-local" name="scheduled_at" defaultValue={toLocalInput(m.scheduled_at)} className="border-b hairline py-1 num" />
                <input type="url" name="meeting_url" defaultValue={m.meeting_url ?? ""} placeholder="会議URL（Zoom / Meet など）" className="border-b hairline py-1 flex-1 min-w-[260px]" />
                <button className="btn-text" type="submit">保存</button>
                {m.held_at ? <span className="text-xs inline-flex items-center gap-2">実施済 {fmtMeeting(m.held_at)}<button className="btn-text text-xs" type="submit" name="unheld" value="1" title="押し間違いのとき。記録は残ります">戻す</button></span> : (
                  <button className="btn-text" type="submit" name="held" value="1">実施済にする</button>
                )}
                <Link href={`/admin/${c.id}/meetings/${m.id}`} className={`rounded-[var(--radius)] border px-3 py-1 text-xs ${recordIds.has(m.id) ? "border-navy text-navy hover:bg-navy-soft" : "border-warm text-warm hover:bg-warm-soft"}`}>{recordIds.has(m.id) ? "記録を見る・直す" : "記録を書く"}</Link>
              </form>
            </li>
          ))}
        </ul>
        {(() => {
          // プログラムの順（キックオフ→確認①→中間→確認②→確認③）。終わった面談は選択肢から外し、まだ登録のない次の面談を最初から選んでおく
          const SEQ = ["kickoff", "session1", "midcheck", "session2", "session3"];
          const heldKinds = new Set((meetings ?? []).filter((m) => m.held_at).map((m) => m.kind));
          const anyKinds = new Set((meetings ?? []).map((m) => m.kind));
          const kinds = [...SEQ.filter((k) => !heldKinds.has(k)), "advisor_monthly", "internal"];
          const defaultKind = SEQ.find((k) => !anyKinds.has(k)) ?? (c.status === "advisor" ? "advisor_monthly" : "internal");
          return (
        <form action={createMeeting} className="mt-4 flex flex-wrap gap-3 items-center text-sm">
          <input type="hidden" name="company_id" value={c.id} />
          <select name="kind" className="border-b hairline py-1" defaultValue={defaultKind}>
            {kinds.map((k) => <option key={k} value={k}>{MEETING_LABEL[k]}</option>)}
          </select>
          <input type="datetime-local" name="scheduled_at" required className="border-b hairline py-1 num" />
          <input type="url" name="meeting_url" placeholder="会議URL（任意・後から追加可）" className="border-b hairline py-1 flex-1 min-w-[260px]" />
          <button className="btn-primary" type="submit">面談を追加</button>
        </form>
          );
        })()}
        <p className="text-xs text-ink-3 mt-2">日時は日本時間。URLが空のままだと顧客側に「会議URL未設定」と出ます。面談が終わったら「記録を書く」で聞いたこと・書き起こし・メモを残してください（AIの下書きの材料になります）。</p>
      </section>

      <section className="mt-10">
        {(() => {
          // 行が多い会社でもページが長くなりすぎないよう、最初の30行だけ出し、残りは開いて見る
          const all = rows ?? [];
          const live = all.filter((r) => r.status === "active" || r.status === "held").length;
          const STATUS_NOTE: Record<string, string> = { held: " 保留", dropped: " 外した", separate: " 別扱い" };
          const item = (r: (typeof all)[number]) => (
            <li key={r.id} className={`py-2 flex gap-3 ${r.status !== "active" ? "text-ink-3" : ""}`}>
              <span className="num w-8 text-ink-3 shrink-0">{r.seq}</span>
              <span className="flex-1 min-w-0">
                <span className={`serif block ${r.status === "dropped" ? "line-through" : ""}`}>{r.value_raw}</span>
                {(r.experience_value ?? r.experience_value_v1) && <span className="block text-ink-2"><span className="text-[11px] text-ink-3 mr-1">だから</span>{r.experience_value ?? r.experience_value_v1}</span>}
                {r.because_phrase && <span className="block text-ink-2"><span className="text-[11px] text-ink-3 mr-1">なぜなら</span>{r.because_phrase}</span>}
              </span>
              <span className="text-xs text-ink-3 shrink-0">{r.created_by === "ai" ? "AI下書き" : ""}{r.confirmed_at ? " 確定" : ""}{STATUS_NOTE[r.status] ?? ""}</span>
            </li>
          );
          return (
            <>
              <h2 className="text-sm text-ink-2">提供価値（{live}行{all.length > live ? <span className="text-ink-3">・外した行など {all.length - live}</span> : null}）</h2>
              {all.length === 0 && <p className="text-sm text-ink-3 mt-2">まだ行がありません。</p>}
              <ol className="mt-2 divide-y divide-hair text-sm">{all.slice(0, 30).map(item)}</ol>
              {all.length > 30 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-sm text-ink-2 py-2">残りの {all.length - 30} 行を表示</summary>
                  <ol className="divide-y divide-hair text-sm">{all.slice(30).map(item)}</ol>
                </details>
              )}
            </>
          );
        })()}
      </section>


      <section className="mt-10">
        <h2 className="text-sm text-ink-2">エラーレポート（未対応 {(errs ?? []).filter((e) => !e.resolved_at).length}）</h2>
        {(errs ?? []).length === 0 && <p className="text-sm text-ink-3 mt-2">エラーレポートは届いていません。</p>}
        <ul className="mt-2 divide-y divide-hair text-sm">
          {(errs ?? []).map((e) => (
            <li key={e.id} className={`py-3 ${e.resolved_at ? "text-ink-3" : ""}`}>
              <p className="whitespace-pre-line">{e.body}</p>
              <p className="text-xs text-ink-3 mt-1 num">{new Date(e.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}{e.page ? ` · ${e.page}` : ""}</p>
              {e.user_agent && <p className="text-[11px] text-ink-3 num break-all">{e.user_agent}</p>}
              {e.screenshot_path && <a href={`/api/admin/file?path=${encodeURIComponent(e.screenshot_path)}`} target="_blank" rel="noopener" className="text-xs underline underline-offset-4">スクリーンショット</a>}
              {!e.resolved_at ? (
                <form action={resolveErrorReport} className="mt-2 flex gap-3 items-center">
                  <input type="hidden" name="id" value={e.id} /><input type="hidden" name="company_id" value={c.id} />
                  <input name="note" placeholder="対応内容（顧客に表示）" className="border-b hairline py-1 text-sm flex-1 max-w-[44em]" />
                  <button className="btn-text" type="submit">対応済みにする</button>
                </form>
              ) : <p className="text-xs mt-1">対応済み{e.resolved_note ? `：${e.resolved_note}` : ""}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-sm text-ink-2">質問（未返信 {(qs ?? []).filter((q) => !q.answered_at).length}）</h2>
        {(qs ?? []).length === 0 && <p className="text-sm text-ink-3 mt-2">質問は届いていません。</p>}
        <ul className="mt-2 divide-y divide-hair text-sm">
          {(qs ?? []).map((q) => (
            <li key={q.id} className="py-4">
              <p className="whitespace-pre-line">{q.body}</p>
              <p className="text-xs text-ink-3 mt-1 num">{new Date(q.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>
              <form action={answerQuestion} className="mt-3 max-w-[40em]">
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

      {isSuper && (
        <section className="mt-16 border-t hairline pt-6">
          <h2 className="text-sm text-ink-2">データのリセット（スーパー管理者だけ）</h2>
          <p className="text-xs text-ink-3 mt-1 max-w-[44em]">テストで入れた情報を消して、この会社を最初の状態に戻します。次の画面で消す範囲と件数を確かめ、会社名を入力してから実行します。消す前に控えを自動で保存します。</p>
          <Link href={`/admin/${c.id}/reset`} className="inline-block mt-3 rounded-[var(--radius)] border border-warm text-warm px-4 py-2 text-sm hover:bg-warm-soft">リセットの確認画面へ</Link>
        </section>
      )}
    </div>
  );
}
