import { requireCustomer } from "@/lib/session";
import { sendErrorReport } from "./actions";
import { ClientEnv } from "@/components/ClientEnv";

const fmt = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function ReportPage() {
  const { supabase, company } = await requireCustomer();
  const { data: reports } = await supabase.from("error_reports").select("id, body, page, created_at, resolved_at, resolved_note").eq("company_id", company.id).order("created_at", { ascending: false }).limit(20);
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">エラーレポート</h1>
      <p className="text-ink-2 text-sm mt-2 max-w-[56ch]">画面が動かない、表示がおかしい、エラーメッセージが出た、などをお知らせください。ベレネッツが確認して直します。</p>

      <form action={sendErrorReport} className="mt-8 max-w-[64ch] space-y-4">
        <ClientEnv />
        <label className="block">
          <span className="text-xs text-ink-2">何が起きましたか（エラーメッセージがあれば、そのまま貼ってください）</span>
          <textarea name="body" required rows={6} className="block w-full border-b hairline py-2 text-sm mt-1" placeholder="例：「行を足す」を押しても何も起きません。画面上部に「Something went wrong」と出ました。" />
        </label>
        <label className="block">
          <span className="text-xs text-ink-2">スクリーンショット（任意・画像10MBまで）</span>
          <input type="file" name="screenshot" accept="image/*" className="block mt-1 text-sm file:mr-3 file:rounded-full file:border file:border-ink-3 file:bg-transparent file:px-3 file:py-1 file:text-[12px]" />
        </label>
        <button className="btn-primary" type="submit">ベレネッツに送る</button>
      </form>

      {reports?.length ? (
        <section className="mt-12 max-w-[64ch]">
          <h2 className="text-sm text-ink-2">送信したレポート</h2>
          <ul className="mt-2 divide-y hairline text-sm">
            {reports.map((r) => (
              <li key={r.id} className="py-3">
                <p className="whitespace-pre-line">{r.body}</p>
                <p className="text-[11px] text-ink-3 mt-1 num">{fmt(r.created_at)}{r.page ? ` · ${r.page}` : ""}</p>
                {r.resolved_at ? (
                  <p className="text-[12px] text-fact mt-1">対応済み{r.resolved_note ? `：${r.resolved_note}` : ""}</p>
                ) : (
                  <p className="text-[12px] text-ink-3 mt-1">確認中</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
