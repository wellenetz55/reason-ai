import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { ClearQuery } from "@/components/ClearQuery";
import { FilePicker } from "@/components/FilePicker";
import { IntakeFiles } from "@/components/IntakeFiles";
import { DiagTabs } from "@/components/DiagTabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadIntake, loadDiagTexts, Q_KEYS, TARGET_KIND_LABEL, VERDICT_LABEL } from "@/server/intake";
import { saveIntake } from "./actions";

const OK: Record<string, string> = { saved: "保存しました。対象と聞き取りは、次のAI下書きから使われます。", saved_tr: "記録と書き起こしを保存しました。次のAI下書きから使われます。", removed: "記録を保存し、書き起こしを外しました。" };

/** 「適合診断を始める」はAIを呼ぶので長めに */
export const maxDuration = 180;

export default async function IntakePage({ params, searchParams }: PageProps<"/admin/[companyId]/intake">) {
  const { companyId } = await params;
  const sp = await searchParams;
  const err = typeof sp?.error === "string" ? sp.error : null;
  const ok = typeof sp?.ok === "string" ? OK[sp.ok] ?? null : null;
  const { supabase } = await requireOperator();
  const [{ data: c }, intake, texts, { data: urls }, memoRes] = await Promise.all([
    supabase.from("companies").select("id, name, status").eq("id", companyId).single(),
    loadIntake(companyId, true),
    loadDiagTexts(),
    supabase.from("company_documents").select("url, title").eq("company_id", companyId).not("url", "is", null).order("created_at"),
    createAdminClient().from("diagnosis_intake_files").select("id, name, storage_path, size_bytes, created_at, text_content").eq("company_id", companyId).order("created_at"),
  ]);
  const memoFiles = (memoRes.data ?? []).map(({ text_content, ...f }) => ({ ...f, chars: text_content?.length ?? 0 }));
  if (!c) notFound();
  const q = Object.fromEntries(Q_KEYS.map((k) => [k, texts[`diag_${k}`] ?? ""]));
  const intro = texts.diag_intro ?? "";
  const guide = texts.diag_guide ?? "";
  const a = intake?.answers ?? {};
  const inp = "block w-full border-b hairline py-2 text-sm";
  const ta = "block w-full border-b hairline py-2 text-sm leading-relaxed";

  return (
    <div>
      <ClearQuery keys={["error", "ok"]} />
      <p className="text-xs text-ink-3"><Link href={`/admin/${c.id}`} className="hover:text-ink">{c.name}</Link> / 適合診断の記録</p>
      <h1 className="serif text-[28px] leading-tight mt-1">適合診断の記録<span className="text-[14px] text-ink-3 font-normal ml-3">ベレネッツだけが見ます。お客様には出ません</span></h1>
      <div className="mt-4"><DiagTabs companyId={c.id} current="intake" /></div>
      <p className="text-sm text-ink-2 mt-2 max-w-[44em]">45分の診断で聞いたことを、ここに残します。AIはこの記録（対象・7問の答え・書き起こし）と会社資料から、STEP 0 と STEP 1 の下書きを作ります。お客様に見せる結果は「<Link href={`/admin/${c.id}/diagnosis`} className="underline underline-offset-4">適合診断の結果を書く</Link>」で別に書きます。</p>
      {err && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[44em]">{err}</p>}
      {ok && <p className="mt-4 text-sm text-navy">{ok}</p>}

      <form id="intake-form" action={saveIntake} data-busy-timeout="180000" className="mt-8 space-y-10 max-w-[880px]">
        <input type="hidden" name="company_id" value={c.id} />

        <section className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><span className="font-semibold">診断日</span><input type="date" name="held_on" required defaultValue={intake?.held_on ?? ""} className="border-b hairline py-1 num text-sm bg-transparent" /></label>
            <label className="flex items-center gap-2 flex-1 min-w-[240px]"><span className="font-semibold whitespace-nowrap">面談した相手</span><input name="attendees" defaultValue={a.attendees ?? ""} className="border-b hairline py-1 text-sm flex-1 bg-transparent" placeholder="例：山田社長、営業部長の○○さん" /></label>
          </div>
          {intake?.updated_at && <p className="text-[11px] text-ink-3 mt-2 num">最終更新 {new Date(intake.updated_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>}
        </section>

        <section>
          <h2 className="serif text-[17px]">1. 対象（何の「選ばれる理由」をつくるか）</h2>
          <p className="text-xs text-ink-3 mt-1">会社全体でなく、買収したブランドや一つの商品が対象のときは、ここで決めます。AIは対象以外（親会社・他の事業）の話を混ぜません。</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
            <select name="target_kind" defaultValue={intake?.target_kind ?? "company"} className="border-b hairline py-2 text-sm">
              {Object.entries(TARGET_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div>
              <input name="target_name" defaultValue={intake?.target_name ?? ""} className={inp} placeholder="対象の名前" />
              <p className="text-[11px] text-ink-3 mt-1">会社全体なら空でよい。事業部・商品のときは必須。例：サンプル工業の「ハヤブサ加工」事業／サンプル商事の「まる得パック」</p>
            </div>
          </div>
          <input name="target_note" defaultValue={intake?.target_note ?? ""} className={inp + " mt-3"} placeholder="運営会社・グループ内の関係" />
          <p className="text-[11px] text-ink-3 mt-1">例：親会社サンプルホールディングスが買収した子会社。親会社の実績は対象に含めない</p>
        </section>

        <section>
          <h2 className="serif text-[17px]">2. URL（対象の公式サイトなど）</h2>
          <p className="text-xs text-ink-3 mt-1">保存すると、お客様のSTEP 0の資料に「Webサイト」として最初から入ります。1行に1つ。</p>
          <textarea name="urls" rows={3} className={ta + " mt-2 num"} placeholder={"https://…\nhttps://…"} />
          {(urls ?? []).length > 0 && (
            <ul className="text-xs text-ink-3 mt-2 space-y-0.5"><li>登録済み：</li>{(urls ?? []).map((u) => <li key={u.url} className="num break-all">{u.url}</li>)}</ul>
          )}
        </section>

        <section>
          <h2 className="serif text-[17px]">3. 7つの質問の答え（面談で聞いたまま・要点でよい）</h2>
          <p className="text-xs text-ink-3 mt-1">録音の書き起こしがあれば、ここは空でも構いません。書き起こしに無い深掘りの答えや、こちらの気づきを残す欄です。</p>
          {intro && <details className="mt-3 text-[13px] text-ink-2"><summary className="cursor-pointer text-ink-3">冒頭の説明（読み上げ用）</summary><p className="mt-2 whitespace-pre-line border-l-2 hairline pl-4 max-w-[44em]">{intro}</p></details>}
          <div className="mt-4 space-y-5">
            {Q_KEYS.map((k, i) => (
              <label key={k} className="block">
                <span className="text-[13px] font-semibold">問{i + 1}{q[k] ? `　${q[k]}` : ""}</span>
                <textarea name={k} rows={2} defaultValue={a[k] ?? ""} className={ta + " mt-1"} />
              </label>
            ))}
            <label className="block">
              <span className="text-[13px] font-semibold">追加で聞いたこと（お客様の発言）</span>
              <textarea name="extra" rows={4} defaultValue={a.extra ?? ""} className={ta + " mt-1"} placeholder="7問以外に聞いたこと、深掘りで出た言葉" />
              <span className="text-[11px] text-ink-3">AIの下書きの材料になります。お客様が話したことだけを書いてください。</span>
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold">ベレネッツの気づき（AIには渡しません）</span>
              <textarea name="memo" rows={3} defaultValue={a.memo ?? ""} className={ta + " mt-1"} placeholder="詰まった場面、社内とお客様の言葉のズレ、次に深掘りしたいこと" />
            </label>
          </div>
          {guide && <details className="mt-4 text-[13px] text-ink-2"><summary className="cursor-pointer text-ink-3">各問で見ているもの・判定の手引き</summary><p className="mt-2 whitespace-pre-line border-l-2 hairline pl-4 max-w-[44em]">{guide}</p></details>}
        </section>

        <section>
          <h2 className="serif text-[17px]">4. 判定（ベレネッツ用メモ）</h2>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <select name="verdict" defaultValue={intake?.verdict ?? ""} className="border-b hairline py-1 text-sm">
              <option value="">（未判定）</option>
              {Object.entries(VERDICT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <textarea name="verdict_note" rows={3} defaultValue={intake?.verdict_note ?? ""} className={ta + " mt-3"} placeholder="素材・言語化・姿勢のそれぞれについて一言。保留なら、時期を改める理由" />
          <p className="text-xs text-ink-3 mt-1">この欄はAIに渡しません。判定を「適合」にして保存すると、会社ページと「適合診断の結果を書く」で、お客様のメールアドレスを登録して招待できるようになります。それまではメールアドレスを入れる欄が出ません。</p>
        </section>

        <div className="flex flex-wrap items-center gap-3"><button className="btn-primary" type="submit">保存</button><span className="text-xs text-ink-3">下の「録音の書き起こし」でファイルを選んでいれば、それもいっしょに保存します。</span></div>
      </form>

      <section className="mt-16 border-t hairline pt-8 max-w-[880px]">
        <h2 className="serif text-[17px]">録音の書き起こし<span className="text-[13px] text-ink-3 font-normal ml-2">上の記録といっしょに保存します（入力中の内容は消えません）</span></h2>
        <p className="text-xs text-ink-3 mt-1">録音の文字起こしファイルを、ここから登録します。新しく登録すると前のものは置き換わります。AIには、ベレネッツ側が読み上げた冒頭の説明と7問を除いて、約4万字を渡します。</p>
        {intake?.transcript ? (
          <div className="mt-3 rounded-[var(--radius)] bg-paper-2 px-4 py-3 text-sm">
            <p>登録済み：<span className="font-medium">{intake.transcript_name || "書き起こし"}</span><span className="num text-ink-3 ml-2">{intake.transcript.length.toLocaleString()} 字</span></p>
            <p className="text-[12px] text-ink-2 mt-2 whitespace-pre-line line-clamp-6">{intake.transcript.slice(0, 600)}{intake.transcript.length > 600 ? "…" : ""}</p>
            <button form="intake-form" name="remove_transcript" value="1" formNoValidate className="btn-text text-xs mt-2" type="submit">外す（上の記録は保存されます）</button>
          </div>
        ) : <p className="mt-3 text-sm text-ink-3">まだ登録されていません。</p>}
        <div className="mt-4 space-y-3">
          <FilePicker key={intake?.updated_at ?? "new"} form="intake-form" name="transcript_file" accept=".txt,.md,.vtt,.pdf,text/plain,text/markdown,text/vtt,application/pdf" hint="対応：.txt / .md / .vtt / .pdf（4MBまで）。Zoomや文字起こしアプリの書き出しをそのまま" />
          <details className="text-[13px]">
            <summary className="cursor-pointer text-ink-3">ファイルでなく、テキストを貼り付ける場合</summary>
            <textarea form="intake-form" name="transcript_text" rows={6} className={ta + " mt-2"} placeholder="ここに貼り付け" />
          </details>
          <button form="intake-form" className="btn-primary" type="submit">書き起こしを登録（上の記録もいっしょに保存）</button>
        </div>
      </section>

      <section className="mt-12 border-t hairline pt-8 max-w-[880px]">
        <h2 className="serif text-[17px]">面談メモ・資料<span className="text-[13px] text-ink-3 font-normal ml-2">複数登録できます</span></h2>
        <p className="text-xs text-ink-3 mt-1">ヒアリング中に取ったメモ、お客様から受け取った資料などを登録します。文字を取り出せたものは、書き起こしと同じようにAIの下書きの材料になります（お客様には出ません）。AIに渡したくない気づきは、上の「ベレネッツの気づき」欄に書いてください。</p>
        {memoRes.error ? <p className="mt-3 text-sm text-warm">面談メモの保存先がまだありません（SQL 0023 が未実行の可能性があります）。</p> : <div className="mt-4"><IntakeFiles companyId={c.id} initial={memoFiles} /></div>}
      </section>

      <section className="mt-14 max-w-[880px] rounded-[var(--radius)] bg-navy-soft px-6 py-7">
        <h2 className="serif text-[20px]">適合診断を始める</h2>
        <p className="text-sm text-ink-2 mt-2 max-w-[44em]">ここまでの記録（7問の答え・書き起こし・面談メモ・会社資料）を保存したうえで、AIが判定の手引きに沿って「適合／保留／不適合」の案と理由を出し、「適合診断の結果を書く」の空いている欄に下書きを入れます。判定を決めるのも、お客様に見せる文章を仕上げるのもベレネッツです。1〜2分かかります。</p>
        <button form="intake-form" name="start_diagnosis" value="1" type="submit" className="btn-primary mt-5 text-[16px] px-8 py-3.5">保存して、適合診断を始める</button>
        <p className="text-[11px] text-ink-3 mt-2">書いてある欄は上書きしません。もう一度押すと、判定案を新しく出し直します。</p>
      </section>
    </div>
  );
}
