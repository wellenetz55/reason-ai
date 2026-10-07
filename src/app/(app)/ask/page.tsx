import { requireCustomer } from "@/lib/session";
import { askOperator } from "./actions";

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
      <ul className="mt-10 divide-y hairline">
        {(qs ?? []).map((q) => (
          <li key={q.id} className="py-4 text-sm">
            <p className="whitespace-pre-line">{q.body}</p>
            <p className="text-xs text-ink-3 mt-1 num">{new Date(q.created_at).toLocaleString("ja-JP")}</p>
            {q.answered_body && <p className="mt-2 pl-4 border-l-2 border-navy whitespace-pre-line">{q.answered_body}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
