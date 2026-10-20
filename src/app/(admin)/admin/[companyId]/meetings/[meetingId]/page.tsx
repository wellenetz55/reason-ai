import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEETING_LABEL, fmtMeeting } from "@/lib/meetings";
import { ClearQuery } from "@/components/ClearQuery";
import { FilePicker } from "@/components/FilePicker";
import { IntakeFiles } from "@/components/IntakeFiles";
import { loadMeetingRecord } from "@/server/meetingRecords";
import { saveMeetingRecord, importPairs } from "./actions";

export const maxDuration = 60;

const OK: Record<string, string> = {
  saved: "保存しました。次のAI下書きから使われます。",
  saved_tr: "記録と書き起こしを保存しました。次のAI下書きから使われます。",
  removed: "記録を保存し、書き起こしを外しました。",
  imported: "提供価値シートに入れました。お客様の STEP 1 に、運営が入れた行として並びます。",
};

export default async function MeetingRecordPage({ params, searchParams }: PageProps<"/admin/[companyId]/meetings/[meetingId]">) {
  const { companyId, meetingId } = await params;
  const sp = await searchParams;
  const err = typeof sp?.error === "string" ? sp.error : null;
  const okKey = typeof sp?.ok === "string" ? sp.ok : null;
  const ok = okKey ? (okKey === "imported" && typeof sp?.n === "string" ? `${sp.n}組を${OK.imported}` : OK[okKey] ?? null) : null;
  await requireOperator();
  const admin = createAdminClient();
  const [{ data: c }, { data: m }, { record, missing }, filesRes] = await Promise.all([
    admin.from("companies").select("id, name, status").eq("id", companyId).single(),
    admin.from("company_meetings").select("id, kind, scheduled_at, held_at, meeting_url").eq("id", meetingId).eq("company_id", companyId).maybeSingle(),
    loadMeetingRecord(meetingId, true),
    admin.from("meeting_files").select("id, name, storage_path, size_bytes, created_at, text_content").eq("meeting_id", meetingId).order("created_at"),
  ]);
  if (!c || !m) notFound();
  const files = (filesRes.data ?? []).map(({ text_content, ...f }) => ({ ...f, chars: text_content?.length ?? 0 }));
  const label = MEETING_LABEL[m.kind] ?? m.kind;
  const isKickoff = m.kind === "kickoff";
  const inp = "block w-full border-b hairline py-2 text-sm";
  const ta = "block w-full border-b hairline py-2 text-sm leading-relaxed";

  return (
    <div>
      <ClearQuery keys={["error", "ok", "n"]} />
      <p className="text-xs text-ink-3"><Link href={`/admin/${c.id}`} className="hover:text-ink">{c.name}</Link> / 面談の記録</p>
      <h1 className="serif text-[28px] leading-tight mt-1">{label}の記録<span className="text-[14px] text-ink-3 font-normal ml-3 num">{fmtMeeting(m.scheduled_at)}{m.held_at ? "　実施済" : ""}</span></h1>
      <p className="text-sm text-ink-2 mt-2 max-w-[44em]">ベレネッツだけが見ます。お客様には出ません。ここに残した「聞いたこと」「書き起こし」「メモ・資料」は、会社プロフィールの下書き、STEP 1 の問いと下書き、「なぜなら」の下書きの材料になります（新しい面談ほど優先）。</p>
      {missing && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[44em]">面談の記録の保存先がまだありません（SQL 0026 が未実行の可能性があります）。</p>}
      {err && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[44em]">{err}</p>}
      {ok && <p className="mt-4 text-sm text-navy">{ok}</p>}

      <form id="meeting-form" action={saveMeetingRecord} data-busy-timeout="120000" className="mt-8 space-y-10 max-w-[880px]">
        <input type="hidden" name="company_id" value={c.id} />
        <input type="hidden" name="meeting_id" value={m.id} />

        <section className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
          <label className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold whitespace-nowrap">面談した相手</span><input name="attendees" defaultValue={record?.attendees ?? ""} className="border-b hairline py-1 text-sm flex-1 min-w-[240px] bg-transparent" placeholder="例：山田社長、営業部長の佐藤さん" /></label>
          {record?.updated_at && <p className="text-[11px] text-ink-3 mt-2 num">最終更新 {new Date(record.updated_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p>}
        </section>

        {isKickoff && (
          <section>
            <h2 className="serif text-[17px]">1. 当日の「御社を一言で言うと？」</h2>
            <p className="text-xs text-ink-3 mt-1">キックオフで聞いたまま。8週間の最後に同じ問いをもう一度するときの「前」の言葉になります。</p>
            <input name="one_liner" defaultValue={record?.one_liner ?? ""} className={inp + " mt-2"} placeholder="聞いたままの言葉" />
          </section>
        )}

        <section>
          <h2 className="serif text-[17px]">{isKickoff ? "2" : "1"}. 面談で聞いたこと（お客様の発言・要点）</h2>
          <p className="text-xs text-ink-3 mt-1">AIの下書きの材料になります。お客様が話した事実・言葉だけを書いてください。ベレネッツの見立ては下の「気づき」へ。</p>
          <textarea name="notes" rows={8} defaultValue={record?.notes ?? ""} className={ta + " mt-2"} placeholder={"・取引前にいちばん困っていたこと\n・なぜ御社を選んだか（お客様の言葉）\n・失注したときに言われたこと\n・社内で当たり前になっていること"} />
        </section>

        {isKickoff && (
          <section>
            <h2 className="serif text-[17px]">3. その場で作った組</h2>
            <p className="text-xs text-ink-3 mt-1">1行に1組。「提供価値｜体験価値」の形（｜で区切る。体験価値は空でもよい）。保存してから下のボタンで、提供価値シートの行として入れられます。</p>
            <textarea name="pairs_text" rows={6} defaultValue={record?.pairs_text ?? ""} className={ta + " mt-2"} placeholder={"図面が粗くても形にできる｜安心して相談できる\n24時間以内に見積りを返せる｜待たされないと感じられる"} />
            {record?.pairs_imported_at && <p className="text-[11px] text-ink-3 mt-1 num">シートに入れた：{new Date(record.pairs_imported_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（同じ提供価値は二重に入りません）</p>}
          </section>
        )}

        <section>
          <h2 className="serif text-[17px]">{isKickoff ? "4" : "2"}. ベレネッツの気づき（AIには渡しません）</h2>
          <textarea name="memo" rows={4} defaultValue={record?.memo ?? ""} className={ta + " mt-2"} placeholder="詰まった場面、社内とお客様の言葉のズレ、次の面談で深掘りしたいこと" />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" type="submit">保存</button>
          {!m.held_at && <button className="btn-text" type="submit" name="held" value="1">保存して、実施済にする</button>}
          <span className="text-xs text-ink-3">下の「録音の書き起こし」でファイルを選んでいれば、それもいっしょに保存します。</span>
        </div>
      </form>

      {isKickoff && (
        <form action={importPairs} className="mt-6 max-w-[880px] rounded-[var(--radius)] bg-navy-soft px-5 py-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="company_id" value={c.id} />
          <input type="hidden" name="meeting_id" value={m.id} />
          <p className="text-sm flex-1 min-w-[240px]">保存した「その場で作った組」を、提供価値シートの行として入れる（運営が入れた行として、お客様の STEP 1 に並びます）</p>
          <button className="btn-primary" type="submit" disabled={!record?.pairs_text}>シートに入れる</button>
        </form>
      )}

      <section className="mt-16 border-t hairline pt-8 max-w-[880px]">
        <h2 className="serif text-[17px]">録音の書き起こし<span className="text-[13px] text-ink-3 font-normal ml-2">上の記録といっしょに保存します</span></h2>
        <p className="text-xs text-ink-3 mt-1">新しく登録すると前のものは置き換わります。AIには抜粋を渡します。</p>
        {record?.transcript ? (
          <div className="mt-3 rounded-[var(--radius)] bg-paper-2 px-4 py-3 text-sm">
            <p>登録済み：<span className="font-medium">{record.transcript_name || "書き起こし"}</span><span className="num text-ink-3 ml-2">{record.transcript.length.toLocaleString()} 字</span></p>
            <p className="text-[12px] text-ink-2 mt-2 whitespace-pre-line line-clamp-6">{record.transcript.slice(0, 600)}{record.transcript.length > 600 ? "…" : ""}</p>
            <button form="meeting-form" name="remove_transcript" value="1" formNoValidate className="btn-text text-xs mt-2" type="submit">外す（上の記録は保存されます）</button>
          </div>
        ) : <p className="mt-3 text-sm text-ink-3">まだ登録されていません。</p>}
        <div className="mt-4 space-y-3">
          <FilePicker key={record?.updated_at ?? "new"} form="meeting-form" name="transcript_file" accept=".txt,.md,.vtt,.pdf,text/plain,text/markdown,text/vtt,application/pdf" hint="対応：.txt / .md / .vtt / .pdf（4MBまで）。Zoomや文字起こしアプリの書き出しをそのまま" />
          <details className="text-[13px]">
            <summary className="cursor-pointer text-ink-3">ファイルでなく、テキストを貼り付ける場合</summary>
            <textarea form="meeting-form" name="transcript_text" rows={6} className={ta + " mt-2"} placeholder="ここに貼り付け" />
          </details>
          <button form="meeting-form" className="btn-primary" type="submit">書き起こしを登録（上の記録もいっしょに保存）</button>
        </div>
      </section>

      <section className="mt-12 border-t hairline pt-8 max-w-[880px]">
        <h2 className="serif text-[17px]">面談メモ・資料<span className="text-[13px] text-ink-3 font-normal ml-2">複数登録できます</span></h2>
        <p className="text-xs text-ink-3 mt-1">ワークショップで書いた紙の写真、ホワイトボード、お客様から受け取った資料など。文字を取り出せたものはAIの材料になります（画像は保管のみ）。</p>
        {filesRes.error ? <p className="mt-3 text-sm text-warm">面談の記録の保存先がまだありません（SQL 0026 が未実行の可能性があります）。</p> : <div className="mt-4"><IntakeFiles companyId={c.id} meetingId={m.id} initial={files} /></div>}
      </section>
    </div>
  );
}
