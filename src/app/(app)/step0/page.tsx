import { ExportButton } from "@/components/ExportButton";
import { NextStepBar } from "@/components/NextStepBar";
import { StepGuide } from "@/components/StepGuide";
import { stepGate } from "@/lib/gates";
import { loadGateCtx } from "@/server/gates";
import { requireCustomer } from "@/lib/session";
import { uploadDocument, addUrl, addText, removeDocument } from "./actions";

const KIND_LABEL: Record<string, string> = {
  brochure: "会社案内・製品パンフ", sales_deck: "営業資料", website: "Webサイト", recruit: "採用ページ",
  exhibition: "展示会資料", testimonial: "顧客の声", presentation: "過去のプレゼン", diagnosis_memo: "診断メモ", other: "その他",
};
const fmtSize = (n?: number | null) => (n ? (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`) : "");
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });

export default async function Page() {
  const { supabase, company } = await requireCustomer();
  const [{ data: docs }, ctx] = await Promise.all([
    supabase.from("company_documents").select("id, kind, title, storage_path, url, text_content, mime_type, size_bytes, created_at").eq("company_id", company.id).order("created_at", { ascending: false }),
    loadGateCtx(supabase, company.id, company.status),
  ]);
  const gate = stepGate("step0", ctx);
  const kindSelect = (
    <select name="kind" className="border-b hairline py-2 text-sm" defaultValue="brochure">
      {Object.entries(KIND_LABEL).filter(([k]) => k !== "diagnosis_memo").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );

  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">会社を知る</h1>
      <StepGuide stageKey="step0" />
      <div className="mt-3"><ExportButton stageKey="step0" /></div>

      <section className="mt-10 grid gap-10 md:grid-cols-3">
        <form action={uploadDocument} className="space-y-3">
          <p className="serif text-[16px]">ファイルを上げる</p>
          <p className="text-[12px] text-ink-3">PDF・画像（PNG/JPG）・テキスト。25MBまで。</p>
          <input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain" className="block w-full text-sm file:mr-3 file:rounded-full file:border file:border-ink-3 file:bg-transparent file:px-3 file:py-1 file:text-[12px]" />
          <input name="title" placeholder="名前（空ならファイル名）" className="block w-full border-b hairline py-2 text-sm" />
          {kindSelect}
          <button className="btn-primary block" type="submit">上げる</button>
        </form>

        <form action={addUrl} className="space-y-3">
          <p className="serif text-[16px]">URLを登録する</p>
          <p className="text-[12px] text-ink-3">Webサイト・採用ページ・レビューページなど。</p>
          <input type="url" name="url" required placeholder="https://" className="block w-full border-b hairline py-2 text-sm num" />
          <input name="title" placeholder="名前（空ならURL）" className="block w-full border-b hairline py-2 text-sm" />
          <select name="kind" className="border-b hairline py-2 text-sm" defaultValue="website">
            {Object.entries(KIND_LABEL).filter(([k]) => k !== "diagnosis_memo").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-primary block" type="submit">登録する</button>
        </form>

        <form action={addText} className="space-y-3">
          <p className="serif text-[16px]">テキストを貼る</p>
          <p className="text-[12px] text-ink-3">議事録・営業トーク・社内メモなど、そのまま貼り付け。</p>
          <input name="title" placeholder="名前（空なら冒頭30字）" className="block w-full border-b hairline py-2 text-sm" />
          <textarea name="text" required rows={5} placeholder="ここに貼り付け" className="block w-full border-b hairline py-2 text-sm" />
          <select name="kind" className="border-b hairline py-2 text-sm" defaultValue="other">
            {Object.entries(KIND_LABEL).filter(([k]) => k !== "diagnosis_memo").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-primary block" type="submit">登録する</button>
        </form>
      </section>

      <p className="mt-8 rounded-[var(--radius)] bg-warm-soft px-5 py-4 text-[13px] text-ink-2 max-w-[72ch] leading-relaxed">
        <span className="font-semibold text-warm">上げないもの：</span>決算書・税務情報・顧客リスト・契約書・給与や人事の情報。これらは提供価値づくりに使いません。
      </p>

      <section className="mt-12">
        <h2 className="serif text-[18px]">登録した資料 <span className="num text-ink-3 text-[14px]">{docs?.length ?? 0}</span></h2>
        {!docs?.length ? (
          <p className="text-sm text-ink-2 mt-3">まだ資料がありません。まず会社案内かWebサイトを1つ上げると、AIが御社の説明の下書きを作れます。</p>
        ) : (
          <ul className="mt-3 divide-y hairline">
            {docs.map((d) => (
              <li key={d.id} className="py-3 flex items-center gap-4 text-sm">
                <span className="text-[11px] text-ink-3 w-28 shrink-0">{KIND_LABEL[d.kind] ?? d.kind}</span>
                <span className="flex-1 min-w-0 truncate">
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

      <NextStepBar gate={gate} />
    </div>
  );
}
