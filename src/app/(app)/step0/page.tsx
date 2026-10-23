import { ClosedStage } from "@/components/ClosedStage";
import { ClearQuery } from "@/components/ClearQuery";
import { STAGES, isStageOpen } from "@/lib/stages";
import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { StepGuide } from "@/components/StepGuide";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { addUrl, addText, removeDocument, getUsage, addCompetitor, removeCompetitor } from "./actions";
import { DirectUploadForm } from "@/components/DirectUploadForm";
import { LIMITS } from "@/lib/limits";
import { requestProfileDraft, reviewProfileItem } from "./actions";
import { ProfileItems } from "@/components/ProfileItems";
import { loadBQuestions } from "@/server/profile";
import { lastAiError } from "@/server/aiGuard";
import { AiNotice } from "@/components/AiNotice";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300; // AIの下書き（資料・URLの読み込みを含む）が画面側の待ち時間より先に打ち切られないように

const KIND_LABEL: Record<string, string> = {
  brochure: "会社案内・製品パンフ", sales_deck: "営業資料", website: "Webサイト", recruit: "採用ページ",
  exhibition: "展示会資料", testimonial: "顧客の声", presentation: "過去のプレゼン", diagnosis_memo: "診断メモ", other: "その他",
};
const fmtSize = (n?: number | null) => (n ? (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`) : "");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });

export default async function Page({ searchParams }: PageProps<"/step0">) {
  const sp = await searchParams;
  const docError = typeof sp?.error === "string" ? sp.error : null;
  const { supabase, company } = await requireCustomer();
  if (!isStageOpen(STAGES.find((x) => x.key === "step0")!, company.status)) return <ClosedStage stageKey="step0" status={company.status} />;
  const [{ data: docs }, ctx, { data: items }, { data: summary }, bq, compRes] = await Promise.all([
    supabase.from("company_documents").select("id, kind, title, storage_path, url, text_content, mime_type, size_bytes, created_at").eq("company_id", company.id).order("created_at", { ascending: false }),
    loadGateCtx(supabase, company.id, company.status),
    supabase.from("profile_items").select("key, draft, value, status, tag, source").eq("company_id", company.id),
    supabase.from("company_profile_summary").select("q1_before").eq("company_id", company.id).maybeSingle(),
    loadBQuestions(),
    supabase.from("competitors").select("id, name, product, website, is_reference, created_at").eq("company_id", company.id).order("is_reference").order("created_at"),
  ]);
  const competitors = compRes.data ?? [];
  const drafted = (items ?? []).some((i) => i.status !== "empty");
  // 適合診断の記録（ベレネッツが聞き取った内容）があれば、資料が無くても下書きを作れる。中身はお客様に見せず、有無だけ見る
  const { count: intakeCount } = await createAdminClient().from("diagnosis_intakes").select("company_id", { count: "exact", head: true }).eq("company_id", company.id);
  const hasIntake = (intakeCount ?? 0) > 0;
  const aiErr = await lastAiError(supabase, company.id, "profile.draft");
  const gate = stepGate("step0", ctx);
  const u = await getUsage();
  const left = { files: LIMITS.files - u.files, urls: LIMITS.urls - u.urls, texts: LIMITS.texts - u.texts };
  const MB = 1024 * 1024;
  const mbLeft = Math.max(0, (LIMITS.totalBytes - u.bytes) / MB);
  const full = (n: number) => n <= 0;
  const kindSelect = (
    <select name="kind" className="border-b hairline py-2 text-sm" defaultValue="brochure">
      {Object.entries(KIND_LABEL).filter(([k]) => k !== "diagnosis_memo").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );

  return (
    <div>
      <ClearQuery keys={["error"]} />
      <h1 className="serif text-[28px] leading-tight">会社を知る</h1>
      {docError && <p role="alert" className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[40em]">{docError}</p>}
      <StepGuide stageKey="step0" />
      <div className="mt-3"><ExportButton stageKey="step0" /></div>

      <section className="mt-10 grid gap-10 md:grid-cols-3">
        <div className="space-y-3">
          <p className="serif text-[16px]">ファイルを上げる</p>
          <p className={`text-[12px] num ${full(left.files) || mbLeft < 1 ? "text-warm" : "text-ink-3"}`}>{full(left.files) ? "上限の20件に達しています。取り下げてから上げてください。" : `あと ${left.files} 件・${mbLeft.toFixed(0)} MB 上げられます`}</p>
          <DirectUploadForm disabled={full(left.files) || mbLeft < 0.01} kindSelect={kindSelect} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain" />
        </div>

        <form action={addUrl} className="space-y-3">
          <p className="serif text-[16px]">URLを登録する</p>
          <p className="text-[12px] text-ink-3">Webサイト・採用ページ・レビューページなど。</p>
          <p className={`text-[12px] num ${full(left.urls) ? "text-warm" : "text-ink-3"}`}>{full(left.urls) ? "上限の20件に達しています。" : `あと ${left.urls} 件`}</p>
          <input type="url" name="url" required placeholder="https://" className="block w-full border-b hairline py-2 text-sm num" />
          <input name="title" placeholder="名前（空ならURL）" className="block w-full border-b hairline py-2 text-sm" />
          <select name="kind" className="border-b hairline py-2 text-sm" defaultValue="website">
            {Object.entries(KIND_LABEL).filter(([k]) => k !== "diagnosis_memo").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-primary block" type="submit" disabled={full(left.urls)}>登録する</button>
        </form>

        <form action={addText} className="space-y-3">
          <p className="serif text-[16px]">テキストを貼る</p>
          <p className="text-[12px] text-ink-3">議事録・営業トーク・社内メモなど、そのまま貼り付け。</p>
          <p className={`text-[12px] num ${full(left.texts) ? "text-warm" : "text-ink-3"}`}>{full(left.texts) ? "上限の20件に達しています。" : `あと ${left.texts} 件`}</p>
          <input name="title" placeholder="名前（空なら冒頭30字）" className="block w-full border-b hairline py-2 text-sm" />
          <textarea name="text" required rows={5} placeholder="ここに貼り付け" className="block w-full border-b hairline py-2 text-sm" />
          <select name="kind" className="border-b hairline py-2 text-sm" defaultValue="other">
            {Object.entries(KIND_LABEL).filter(([k]) => k !== "diagnosis_memo").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-primary block" type="submit" disabled={full(left.texts)}>登録する</button>
        </form>
      </section>

      <p className="mt-8 rounded-[var(--radius)] bg-warm-soft px-5 py-4 text-[13px] text-ink-2 max-w-[44em] leading-relaxed">
        <span className="font-semibold text-warm">上げないもの：</span>決算書・税務情報・顧客リスト・契約書・給与や人事の情報。これらは提供価値づくりに使いません。
      </p>

      <section className="mt-12">
        <h2 className="serif text-[18px]">登録した資料 <span className="num text-ink-3 text-[14px]">{docs?.length ?? 0}</span></h2>
        <p className="text-[12px] text-ink-3 mt-1 num">ファイル {u.files}/{LIMITS.files}（{(u.bytes / MB).toFixed(0)}/{Math.round(LIMITS.totalBytes / MB)} MB）・URL {u.urls}/{LIMITS.urls}・テキスト {u.texts}/{LIMITS.texts}</p>
        {!docs?.length ? (
          <p className="text-sm text-ink-2 mt-3">まだ資料がありません。まず会社案内かWebサイトを1つ上げると、AIが御社の説明の下書きを作れます。</p>
        ) : (
          <ul className="mt-3 divide-y divide-hair">
            {docs.map((d) => (
              <li key={d.id} className="py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-[11px] text-ink-3 sm:w-28 shrink-0">{KIND_LABEL[d.kind] ?? d.kind}</span>
                <span className="basis-full sm:basis-auto sm:flex-1 min-w-0 truncate order-first sm:order-none">
                  {d.storage_path ? <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="underline underline-offset-4">{d.title}</a>
                    : d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{d.title} ↗</a>
                    : <span title={d.text_content?.slice(0, 200)}>{d.title}</span>}
                </span>
                <span className="num text-[11px] text-ink-3 shrink-0">{d.storage_path ? fmtSize(d.size_bytes) : d.url ? "URL" : `テキスト ${d.text_content?.length ?? 0}字`}</span>
                <span className="num text-[11px] text-ink-3 shrink-0">{fmtDate(d.created_at)}</span>
                <form action={removeDocument}><input type="hidden" name="id" value={d.id} /><button className="btn-text" type="submit">取り下げ</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14">
        <h2 className="serif text-[18px]">競合他社 <span className="num text-ink-3 text-[14px]">{competitors.filter((c) => !c.is_reference).length}/3</span></h2>
        <p className="text-sm text-ink-2 mt-1 max-w-[40em]">お客様が御社と比べる相手を、最大3社。加えて「こうなりたい」参考の会社を1社入れられます。AIが「競合の弱みの裏返し」や競合比較の材料に使います。会社名だけでも構いません。</p>
        {compRes.error && <p className="text-[12px] text-warm mt-2">競合の登録先に不足があります（SQL 0027 が未実行の可能性があります）。</p>}
        {competitors.length > 0 && (
          <ul className="mt-3 divide-y divide-hair">
            {competitors.map((c) => (
              <li key={c.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="text-[11px] text-ink-3 w-10 shrink-0">{c.is_reference ? "参考" : "競合"}</span>
                <span className="font-medium">{c.name}</span>
                {c.product && <span className="text-ink-2">{c.product}</span>}
                {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="num text-[12px] underline underline-offset-4 break-all">{c.website.replace(/^https?:\/\//, "")} ↗</a>}
                <form action={removeCompetitor} className="ml-auto"><input type="hidden" name="id" value={c.id} /><button className="btn-text text-xs" type="submit">外す</button></form>
              </li>
            ))}
          </ul>
        )}
        {(
          <form action={addCompetitor} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr_auto_auto] items-end max-w-[900px]">
            <label className="block"><span className="text-[11px] text-ink-3">会社名（必須）</span><input name="name" required className="block w-full border-b hairline py-2 text-sm" placeholder="例：サンプル工業" /></label>
            <label className="block"><span className="text-[11px] text-ink-3">商品・サービス名</span><input name="product" className="block w-full border-b hairline py-2 text-sm" placeholder="例：ハヤブサ加工" /></label>
            <label className="block"><span className="text-[11px] text-ink-3">URL</span><input name="website" className="block w-full border-b hairline py-2 text-sm num" placeholder="https://…" /></label>
            <label className="flex items-center gap-1.5 text-[12px] text-ink-2 whitespace-nowrap pb-2"><input type="checkbox" name="is_reference" value="1" className="size-4" />参考の会社</label>
            <button className="btn-primary" type="submit">追加</button>
          </form>
        )}
      </section>

      <section className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="serif text-[22px]">御社の説明</h2>
            <p className="text-sm text-ink-2 mt-1 max-w-[40em]">上の資料をAIが読んで下書きします。項目ごとに「直す／承認／保留」してください。一括承認はありません。</p>
          </div>
          <form action={requestProfileDraft}>
            <button className="btn-primary" type="submit" disabled={!docs?.length && !hasIntake}>{drafted ? "資料から下書きを作り直す" : "資料から下書きを作る"}</button>
          </form>
        </div>
        {!docs?.length && <p className="text-[12px] text-warm mt-2">まず資料を1つ以上登録してください。</p>}
        <AiNotice message={aiErr} />
        {drafted && <p className="text-[12px] text-ink-3 mt-2">作り直しても、承認済み・直した・保留の項目と、「戻す」で直し中の御社の文は変わりません。画像の資料は読めないので、文字はテキストで貼ってください。</p>}
        <div className="mt-6 max-w-[880px]">
          <ProfileItems items={items ?? []} bq={bq} oneLiner={summary?.q1_before ?? null} review={reviewProfileItem} drafted={!!drafted} />
        </div>
      </section>

      <NextStepBar gate={gate} />
    </div>
  );
}
