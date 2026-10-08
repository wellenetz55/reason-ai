import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { saveDiagnosis, publishDiagnosis } from "./actions";
import { toLocalInput, fmtMeeting } from "@/lib/meetings";
import { BRAKE_LABEL, FIT_CONDITIONS } from "@/lib/diagnosis";

type Seed = { feature: string; experience: string; tag: string };
type Brake = { kind: string; words: string };
type Fit = { condition: string; quote: string };

export default async function DiagnosisAdmin({ params }: PageProps<"/admin/[companyId]/diagnosis">) {
  const { companyId } = await params;
  const { supabase } = await requireOperator();
  const [{ data: c }, { data: d }, { data: members }] = await Promise.all([
    supabase.from("companies").select("id, name, status").eq("id", companyId).single(),
    supabase.from("diagnosis_results").select("*").eq("company_id", companyId).maybeSingle(),
    supabase.from("profiles").select("display_name").eq("company_id", companyId),
  ]);
  if (!c) return null;
  const seeds = ((d?.seeds ?? []) as Seed[]);
  const brakes = ((d?.brakes ?? []) as Brake[]);
  const fit = ((d?.fit_reasons ?? []) as Fit[]);
  const comp = (d?.competitor ?? null) as { name: string; claims: string[] } | null;
  const dates = ((d?.candidate_dates ?? []) as string[]);
  const inp = "block w-full border-b hairline py-2 text-sm";

  return (
    <div>
      <p className="text-xs text-ink-3"><Link href={`/admin/${c.id}`} className="hover:text-ink">{c.name}</Link> / 適合診断の結果</p>
      <h1 className="serif text-[28px] leading-tight mt-1">適合診断の結果を書く</h1>
      <p className="text-sm text-ink-2 mt-2 max-w-[64ch]">面談直後に10分で埋める量にしてあります。顧客はログイン直後にこのページを見ます。空の項目は顧客側に出ません。</p>

      <form action={saveDiagnosis} className="mt-8 space-y-10 max-w-[760px]">
        <input type="hidden" name="company_id" value={c.id} />

        <section>
          <h2 className="serif text-[17px]">1. 御社を一言で（面談で聞いたまま）</h2>
          <input name="one_liner_before" defaultValue={d?.one_liner_before ?? ""} className={inp} placeholder="例：名古屋で40年、法人向けのブランディング会社" />
        </section>

        <section>
          <h2 className="serif text-[17px]">2. 選ばれる理由の芽（最大3）</h2>
          <p className="text-xs text-ink-3 mt-1">御社は〜できる／だから、お客様は〜と感じられる。仮説のまま出してよい</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="mt-3 grid grid-cols-[1fr_1fr_100px] gap-3">
              <input name={`seed${i + 1}_feature`} defaultValue={seeds[i]?.feature ?? ""} className={inp} placeholder="御社は〜できる" />
              <input name={`seed${i + 1}_experience`} defaultValue={seeds[i]?.experience ?? ""} className={inp} placeholder="だから、お客様は〜と感じられる" />
              <select name={`seed${i + 1}_tag`} defaultValue={seeds[i]?.tag ?? "hypothesis"} className="border-b hairline py-2 text-sm">
                <option value="hypothesis">仮説</option><option value="verify">要確認</option><option value="fact">事実</option>
              </select>
            </div>
          ))}
        </section>

        <section>
          <h2 className="serif text-[17px]">3. まだ言葉になっていないブレーキ（最大2）</h2>
          {[0, 1].map((i) => (
            <div key={i} className="mt-3 grid grid-cols-[180px_1fr] gap-3">
              <select name={`brake${i + 1}_kind`} defaultValue={brakes[i]?.kind ?? "distrust"} className="border-b hairline py-2 text-sm">
                {Object.entries(BRAKE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input name={`brake${i + 1}_words`} defaultValue={brakes[i]?.words ?? ""} className={inp} placeholder="お客様の言葉で。例：「本当にうちの業界でもできるの？」" />
            </div>
          ))}
        </section>

        <section>
          <h2 className="serif text-[17px]">4. なぜ適合と判断したか（最大3）</h2>
          <p className="text-xs text-ink-3 mt-1">条件を選び、面談でのご発言を引用する。全社共通の文面に見えないように</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="mt-3 grid grid-cols-[260px_1fr] gap-3">
              <select name={`fit${i + 1}_condition`} defaultValue={fit[i]?.condition ?? ""} className="border-b hairline py-2 text-sm">
                <option value="">（使わない）</option>
                {FIT_CONDITIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <input name={`fit${i + 1}_quote`} defaultValue={fit[i]?.quote ?? ""} className={inp} placeholder="「……」とおっしゃった" />
            </div>
          ))}
        </section>

        <section>
          <h2 className="serif text-[17px]">5. 競合1社の「言っていること」</h2>
          <input name="comp_name" defaultValue={comp?.name ?? ""} className={inp} placeholder="競合名" />
          {[0, 1, 2].map((i) => <input key={i} name={`comp_claim${i + 1}`} defaultValue={comp?.claims?.[i] ?? ""} className={inp + " mt-2"} placeholder={`訴求 ${i + 1}（公開情報から）`} />)}
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
        <p className="text-sm text-ink-2 mt-1">担当者のメールにマジックリンクが届き、ログインするとこの診断結果が最初に開きます。登録済みの担当者がいる場合はメールを空のままで公開だけできます。</p>
        {members?.length ? <p className="text-xs text-ink-3 mt-2">登録済み担当者：{members.map((m) => m.display_name).join("、")}</p> : null}
        <form action={publishDiagnosis} className="mt-4 flex flex-wrap gap-3 items-end">
          <input type="hidden" name="company_id" value={c.id} />
          <label className="flex-1 min-w-[240px]"><span className="text-xs text-ink-2">担当者メール</span><input type="email" name="email" className={inp} /></label>
          <label className="w-48"><span className="text-xs text-ink-2">お名前</span><input name="display_name" className={inp} /></label>
          <button className="btn-primary" type="submit" disabled={!d}>{d?.published_at ? "再送して公開を更新" : "公開して招待する"}</button>
        </form>
        {d?.published_at && <p className="text-xs text-ink-3 mt-2 num">公開済み {fmtMeeting(d.published_at)}{d.chosen_date ? `　／　顧客が選んだキックオフ日 ${fmtMeeting(d.chosen_date)}` : ""}</p>}
      </section>
    </div>
  );
}
