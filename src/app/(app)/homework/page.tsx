import { requireCustomer } from "@/lib/session";
import { answerHomework } from "./actions";
import { ClearQuery } from "@/components/ClearQuery";

export default async function HomeworkPage({ searchParams }: PageProps<"/homework">) {
  const sp = await searchParams;
  const formError = typeof sp?.error === "string" ? sp.error : null;
  const { supabase, company } = await requireCustomer();
  const { data: items } = await supabase.from("homeworks").select("*").eq("company_id", company.id).order("priority", { ascending: false }).order("due_at");
  const open = (items ?? []).filter((h) => h.status === "open");
  const done = (items ?? []).filter((h) => h.status !== "open");
  const closed = ["diagnosed", "locked", "cancelled"].includes(company.status);
  return (
    <div>
      <ClearQuery keys={["error"]} />
      <h1 className="serif text-[28px] leading-tight">宿題</h1>
      {formError && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[40em]">{formError}。入力した内容は送られていません。</p>}
      <p className="text-ink-2 text-sm mt-2 max-w-[40em]">一人で決めないでください。周りの人に聞いてから書いてください。誰に聞いたかも残します。</p>
      {open.length === 0 && <p className="mt-10 text-sm text-ink-3">いま出ている宿題はありません。</p>}
      <ul className="mt-8 divide-y divide-hair">
        {open.map((h) => (
          <li key={h.id} className="py-6">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="text-hypo text-xs">{"★".repeat(h.priority)}</span>
              <h2 className="text-[17px]">{h.title}</h2>
              {h.due_at && <span className="num text-xs text-ink-3 whitespace-nowrap">期限 {new Date(h.due_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" })}</span>}
            </div>
            {h.why && <p className="text-sm text-ink-2 mt-1">効く場所：{h.why}</p>}
            {h.ask_whom_hint && <p className="text-sm text-ink-2 mt-1">まず{h.ask_whom_hint}に聞いてください。</p>}
            {closed ? <p className="mt-3 text-[13px] text-ink-3">編集できる期間が終わったため、回答はできません。</p> : (
            <form action={answerHomework} className="mt-4 space-y-3 max-w-[40em]">
              <input type="hidden" name="id" value={h.id} />
              {(h.answer || h.pass_reason) && <p className="text-[12px] text-ink-3">ベレネッツからもう一度お願いしている宿題です。前回の回答を残してあります。書き足してください。</p>}
              <textarea name="answer" rows={3} required defaultValue={h.answer ?? h.pass_reason ?? ""} placeholder="回答（パスする場合は理由）" className="w-full border-b hairline py-2 text-sm" />
              <input name="asked_whom" defaultValue={h.asked_whom ?? ""} required pattern=".*\S.*" title="誰に聞いたかを入力してください" placeholder="誰に聞いたか（必須）" className="w-full border-b hairline py-2 text-sm" />
              <div className="flex gap-2">
                <button className="btn-primary" name="mode" value="answer" type="submit">回答する</button>
                <button className="btn-text" name="mode" value="pass" type="submit">今回はパス（理由を回答欄に）</button>
              </div>
            </form>
            )}
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <details className="mt-10">
          <summary className="text-sm text-ink-3 cursor-pointer">済んだ宿題 {done.length}</summary>
          <ul className="mt-3 divide-y divide-hair">
            {done.map((h) => (
              <li key={h.id} className="py-3 text-sm">
                <span className="text-ink-2">{h.status === "passed" ? "パス" : "回答済み"}</span> · {h.title}
                {(h.answer || h.pass_reason) && <p className="text-ink-2 mt-1 whitespace-pre-line">{h.answer ?? `パスの理由：${h.pass_reason}`}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
