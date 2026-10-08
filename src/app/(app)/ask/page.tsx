import { requireCustomer } from "@/lib/session";
import { askOperator } from "./actions";

const fmt = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function AskPage() {
  const { supabase, company } = await requireCustomer();
  const { data: qs } = await supabase.from("questions_to_operator").select("*").eq("company_id", company.id).order("created_at", { ascending: false });
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">ベレネッツに質問を残す</h1>
      <p className="text-ink-2 text-sm mt-2 max-w-[56ch]">迷ったところ、判断に困ったところを書いてください。次の面談か、それより前に人が返します。</p>
      <form action={askOperator} className="mt-8 max-w-[64ch] space-y-3">
        <textarea name="body" required rows={4} className="w-full border-b hairline py-2 text-sm" placeholder="例：行12と行18は同じことを言っている気がします。どちらを残すべきですか。" />
        <button className="btn-primary" type="submit">質問を残す</button>
      </form>
      <ul className="mt-10 space-y-6 max-w-[64ch]">
        {(qs ?? []).map((q) => (
          <li key={q.id} className="text-sm">
            <div className="rounded-[var(--radius)] bg-paper-2 px-5 py-4">
              <p className="text-[11px] text-ink-3">あなたの質問 · <span className="num">{fmt(q.created_at)}</span></p>
              <p className="whitespace-pre-line mt-1.5">{q.body}</p>
            </div>
            {q.answered_body ? (
              <div className="ml-6 mt-2 rounded-[var(--radius)] bg-navy-soft px-5 py-4 border-l-2 border-navy">
                <p className="text-[11px] font-semibold text-navy">ベレネッツからの返事 · <span className="num font-normal">{q.answered_at ? fmt(q.answered_at) : ""}</span></p>
                <p className="whitespace-pre-line mt-1.5">{q.answered_body}</p>
              </div>
            ) : (
              <p className="ml-6 mt-2 text-[12px] text-warm">返事待ち。次の面談か、それより前に人が返します。</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
