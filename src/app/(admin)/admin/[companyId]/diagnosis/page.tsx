import { notFound } from "next/navigation";
import { ClearQuery } from "@/components/ClearQuery";
import { GrowText } from "@/components/GrowText";
import { DiagTabs } from "@/components/DiagTabs";
import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { saveDiagnosis, publishDiagnosis, setVerdict } from "./actions";
import { toLocalInput, fmtMeeting } from "@/lib/meetings";
import { BRAKE_LABEL, FIT_CONDITIONS } from "@/lib/diagnosis";
import { inviteGate, loadIntake, VERDICT_LABEL } from "@/server/intake";

type Seed = { feature: string; experience: string; tag: string };
type Brake = { kind: string; words: string };
type Fit = { condition: string; quote: string };

export default async function DiagnosisAdmin({ params, searchParams }: PageProps<"/admin/[companyId]/diagnosis">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const err = typeof sp?.error === "string" ? sp.error : null;
  const notice = typeof sp?.notice === "string" ? sp.notice : null;
  const { supabase } = await requireOperator();
  const [{ data: c }, { data: d }, { data: members }] = await Promise.all([
    supabase.from("companies").select("id, name, status").eq("id", companyId).single(),
    supabase.from("diagnosis_results").select("*").eq("company_id", companyId).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("company_id", companyId),
  ]);
  if (!c) notFound();
  const [gate, intake] = await Promise.all([inviteGate(companyId, c.status), loadIntake(companyId).catch(() => null)]);
  const aiVerdict = intake?.verdict_note?.match(/^【AI判定案：([^】]+)】/)?.[1] ?? null;
  const seeds = ((d?.seeds ?? []) as Seed[]);
  const brakes = ((d?.brakes ?? []) as Brake[]);
  const fit = ((d?.fit_reasons ?? []) as Fit[]);
  const comp = (d?.competitor ?? null) as { name: string; claims: string[] } | null;
  const dates = ((d?.candidate_dates ?? []) as string[]);
  const inp = "block w-full border-b hairline py-2 text-sm";

  return (
    <div>
      <ClearQuery keys={["error", "notice"]} />
      <p className="text-xs text-ink-3"><Link href={`/admin/${c.id}`} className="hover:text-ink">{c.name}</Link> / 適合診断の結果を書く</p>
      <h1 className="serif text-[28px] leading-tight mt-1">適合診断の結果を書く</h1>
      <div className="mt-4"><DiagTabs companyId={c.id} current="diagnosis" /></div>
      <p className="text-sm text-ink-2 mt-2 max-w-[40em]">面談直後に10分で埋める量にしてあります。お客様はサインイン直後にこのページを見ます。空の項目はお客様の画面に出ません。</p>
      {err && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[40em]">{err}</p>}
      {notice && <p className="mt-4 rounded-[var(--radius)] bg-navy-soft px-4 py-3 text-sm max-w-[40em]">{notice}</p>}

      <form action={saveDiagnosis} className="mt-8 space-y-10 max-w-[760px]">
        <input type="hidden" name="company_id" value={c.id} />

        <section>
          <h2 className="serif text-[17px]">0. エグゼクティブサマリー（結果ページの一番上に出ます）</h2>
          <p className="text-xs text-ink-3 mt-1">お客様がこれだけ読めば診断の中身が分かり、「やってみよう」と思える要約。面談で分かったこと → 御社が選ばれている理由の核 → 足りないのは言葉だけ → 8週間で何が変わるか、の順で300〜450字。お客様自身の言葉を使う。空なら出ません</p>
          <textarea name="summary" defaultValue={d?.summary ?? ""} rows={7} className={inp + " leading-relaxed"} placeholder="例：45分のお話で、御社が選ばれている理由は……" />
        </section>

        <section>
          <h2 className="serif text-[17px]">1. 御社を一言で（面談で聞いたまま）</h2>
          <GrowText name="one_liner_before" defaultValue={d?.one_liner_before ?? ""} className={inp} placeholder="例：名古屋で40年、法人向けのブランディング会社" />
        </section>

        <section>
          <h2 className="serif text-[17px]">2. 選ばれる理由の芽（最大3）</h2>
          <p className="text-xs text-ink-3 mt-1">御社は〜できる／だから、お客様は〜と感じられる。仮説のまま出してよい</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_100px] gap-3 items-start">
              <GrowText name={`seed${i + 1}_feature`} defaultValue={seeds[i]?.feature ?? ""} className={inp} placeholder="〜できる（「御社は」は自動で付きます）" />
              <GrowText name={`seed${i + 1}_experience`} defaultValue={seeds[i]?.experience ?? ""} className={inp} placeholder="〜と感じられる（「だから、お客様は」は自動）" />
              <select name={`seed${i + 1}_tag`} defaultValue={seeds[i]?.tag ?? "hypothesis"} className="border-b hairline py-2 text-sm">
                <option value="hypothesis">仮説</option><option value="verify">要確認</option><option value="fact">事実</option>
              </select>
            </div>
          ))}
        </section>

        <section>
          <h2 className="serif text-[17px]">3. まだ言葉になっていないブレーキ（最大2）</h2>
          <p className="text-xs text-ink-3 mt-1">御社の「買い手」が、競合でなく御社を選ぶ直前に抱くためらい（4つの不）。面談相手がブランディングに進むことへの迷いではありません。</p>
          {[0, 1].map((i) => (
            <div key={i} className="mt-3 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 items-start">
              <select name={`brake${i + 1}_kind`} defaultValue={brakes[i]?.kind ?? "distrust"} className="border-b hairline py-2 text-sm">
                {Object.entries(BRAKE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <GrowText name={`brake${i + 1}_words`} defaultValue={brakes[i]?.words ?? ""} className={inp} placeholder="買い手の心の声で（カギ括弧は自動）。例：本当にうちの規模でも頼めるのか" />
            </div>
          ))}
        </section>

        <section>
          <h2 className="serif text-[17px]">4. なぜ適合と判断したか（最大3）</h2>
          <p className="text-xs text-ink-3 mt-1">条件を選び、面談でのご発言を引用する。全社共通の文面に見えないように</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="mt-4 space-y-1">
              <span className="block text-[11px] text-ink-3 num">理由 {i + 1}</span>
              <select name={`fit${i + 1}_condition`} defaultValue={fit[i]?.condition ?? ""} className="block w-full border-b hairline py-2 text-sm">
                <option value="">（使わない）</option>
                {FIT_CONDITIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <GrowText name={`fit${i + 1}_quote`} defaultValue={fit[i]?.quote ?? ""} className={inp} placeholder="「……」とおっしゃった" />
            </div>
          ))}
        </section>

        <section>
          <h2 className="serif text-[17px]">5. 競合1社の「言っていること」</h2>
          <GrowText name="comp_name" defaultValue={comp?.name ?? ""} className={inp} placeholder="競合名" />
          {[0, 1, 2].map((i) => <GrowText key={i} name={`comp_claim${i + 1}`} defaultValue={comp?.claims?.[i] ?? ""} className={inp + " mt-2"} placeholder={`訴求 ${i + 1}（公開情報から）`} />)}
        </section>

        <section>
          <h2 className="serif text-[17px]">6. キックオフ候補日（3つ・日本時間）</h2>
          <div className="mt-2 flex gap-4">
            {[0, 1, 2].map((i) => <input key={i} type="datetime-local" name={`date${i + 1}`} defaultValue={dates[i] ? toLocalInput(dates[i]) : ""} className="border-b hairline py-2 text-sm num" />)}
          </div>
        </section>

        <section>
          <h2 className="serif text-[17px]">7. 平松からの一言</h2>
          <textarea name="operator_note" defaultValue={d?.operator_note ?? ""} rows={3} className={inp} placeholder="面談で一番印象に残った言葉と、それについて一言" />
        </section>

        <section>
          <h2 className="serif text-[17px]">8. 閲覧期限（任意）</h2>
          <input type="datetime-local" name="expires_at" defaultValue={d?.expires_at ? toLocalInput(d.expires_at) : ""} className="border-b hairline py-2 text-sm num" />
          <p className="text-xs text-ink-3 mt-1">空なら期限なし。入れると顧客側に「このページは◯月◯日まで」と穏やかに出ます</p>
        </section>

        <button className="btn-primary" type="submit">保存する</button>
        {d?.updated_at && <span className="text-xs text-ink-3 ml-3 num">保存 {fmtMeeting(d.updated_at)}</span>}
      </form>

      <section className="mt-16 border-t hairline pt-8 max-w-[760px]">
        <h2 className="serif text-[17px]">公開して招待する</h2>
        <p className="text-sm text-ink-2 mt-1">担当者のメールにサインイン用のリンクが届き、サインインするとこの診断結果が最初に開きます。登録済みの担当者がいる場合はメールを空のままで公開だけできます。</p>
        {members?.length ? <p className="text-xs text-ink-3 mt-2">登録済み担当者：{members.map((m) => m.display_name).join("、")}</p> : null}
        <p className="mt-3 text-xs text-warm">公開されるのは「保存」した内容です。上で編集した場合は、先に「保存」を押してください。</p>
        {gate.ok ? (
          <form action={publishDiagnosis} className="mt-4 flex flex-wrap gap-3 items-end">
            <input type="hidden" name="company_id" value={c.id} />
            <label className="flex-1 min-w-[240px]"><span className="text-xs text-ink-2">担当者メール</span><input type="email" name="email" className={inp} /></label>
            <label className="w-48"><span className="text-xs text-ink-2">お名前</span><input name="display_name" className={inp} /></label>
            <button className="btn-primary" type="submit" disabled={!d}>{d?.published_at ? "公開を更新（メールがあれば招待も）" : "公開して招待する"}</button>
            {!d && <p className="w-full text-xs text-warm">先に上の内容を「保存する」で保存してください。</p>}
          </form>
        ) : (
          <div className="mt-4 rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-5 py-4 max-w-[44em]">
            <p className="text-sm font-semibold text-warm">判定がまだ「適合」になっていないため、お客様のメールアドレスを入れる欄は出ていません。</p>
            <p className="text-[13px] text-ink-2 mt-1">いまの判定：<span className="font-semibold">{VERDICT_LABEL[intake?.verdict ?? ""] ?? "未判定"}</span>{aiVerdict ? <span className="ml-3">AIの判定案：<span className="font-semibold">{aiVerdict}</span>（理由は <Link href={`/admin/${c.id}/intake`} className="underline underline-offset-4">適合診断の記録</Link> の判定メモ）</span> : null}</p>
            <form action={setVerdict} className="mt-3 flex flex-wrap items-center gap-3">
              <input type="hidden" name="company_id" value={c.id} />
              <label className="text-sm flex items-center gap-2">判定を決める
                <select name="verdict" defaultValue={intake?.verdict ?? (aiVerdict === "適合" ? "fit" : aiVerdict === "保留" ? "hold" : aiVerdict === "不適合" ? "unfit" : "")} className="border-b hairline py-1 text-sm bg-transparent" required>
                  <option value="">（選ぶ）</option>
                  {Object.entries(VERDICT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <button className="btn-primary" type="submit">判定を保存</button>
            </form>
            <p className="text-[12px] text-ink-3 mt-2">「適合」にすると、ここにメールアドレスとお名前の欄が出て、公開・招待できます。結果の下書きは、判定が固まる前でも保存しておけます。</p>
          </div>
        )}
        {d?.published_at && <p className="text-xs text-ink-3 mt-2 num">公開済み {fmtMeeting(d.published_at)}{d.chosen_date ? `　／　顧客が選んだキックオフ日 ${fmtMeeting(d.chosen_date)}` : ""}</p>}
      </section>
    </div>
  );
}
