import { requireCustomer } from "@/lib/session";
import { answerHomework } from "./actions";

export default async function HomeworkPage() {
  const { supabase, company } = await requireCustomer();
  const { data: items } = await supabase.from("homeworks").select("*").eq("company_id", company.id).order("priority", { ascending: false }).order("due_at");
  const open = (items ?? []).filter((h) => h.status === "open");
  const done = (items ?? []).filter((h) => h.status !== "open");
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">宿題</h1>
      <p className="text-ink-2 text-sm mt-2 max-w-[56ch]">一人で決めないでください。周りの人に聞いてから書いてください。誰に聞いたかも残します。</p>
      {open.length === 0 && <p className="mt-10 text-sm text-ink-3">いま出ている宿題はありません。</p>}
      <ul className="mt-8 divide-y hairline">
        {open.map((h) => (
          <li key={h.id} className="py-6">
            <div className="flex items-baseline gap-3">
              <span className="text-hypo text-xs">{"★".repeat(h.priority)}</span>
              <h2 className="text-[17px]">{h.title}</h2>
              {h.due_at && <span className="num text-xs text-ink-3">期限 {new Date(h.due_at).toLocaleDateString("ja-JP")}</span>}
            </div>
            {h.why && <p className="text-sm text-ink-2 mt-1">効く場所：{h.why}</p>}
            {h.ask_whom_hint && <p className="text-sm text-ink-2 mt-1">まず{h.ask_whom_hint}に聞いてください。</p>}
            <form action={answerHomework} className="mt-4 space-y-3 max-w-[64ch]">
              <input type="hidden" name="id" value={h.id} />
              <textarea name="answer" rows={3} placeholder="回答" className="w-full border-b hairline py-2 text-sm" />
              <input name="asked_whom" required placeholder="誰に聞いたか（必須）" className="w-full border-b hairline py-2 text-sm" />
              <div className="flex gap-2">
                <button className="btn-primary" name="mode" value="answer" type="submit">回答する</button>
                <button className="btn-text" name="mode" value="pass" type="submit">今回はパス（理由を回答欄に）</button>
              </div>
            </form>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <details className="mt-10">
          <summary className="text-sm text-ink-3 cursor-pointer">済んだ宿題 {done.length}</summary>
          <ul className="mt-3 divide-y hairline">
            {done.map((h) => (
              <li key={h.id} className="py-3 text-sm">
                <span className="text-ink-2">{h.status === "passed" ? "パス" : "回答済み"}</span> · {h.title}
                {h.answer && <p className="text-ink-2 mt-1 whitespace-pre-line">{h.answer}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
