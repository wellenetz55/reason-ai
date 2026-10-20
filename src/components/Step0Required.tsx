import Link from "next/link";
import { STAGES } from "@/lib/stages";

/** STEP 0 が空のまま先の段階を開いたときの案内。資料か会社の説明を入れるまで進めない */
export function Step0Required({ stageKey }: { stageKey: string }) {
  const s = STAGES.find((x) => x.key === stageKey);
  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">{s?.label ?? ""}</h1>
      <section className="mt-10 rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-6 py-5 max-w-[40em]">
        <p className="font-semibold">先に、STEP 0 で御社のことをAIに教えてください。</p>
        <p className="text-sm text-ink-2 mt-2 leading-relaxed">この段階のAIの下書きは、STEP 0 の会社資料と「御社はこういう会社です」の説明を土台にします。まだ何も入っていないので、会社案内やWebサイトを1つ以上登録するか、御社の説明を1項目以上入れると、ここが開きます。</p>
        <Link href="/step0" className="btn-primary inline-block mt-5">STEP 0 会社を知る へ →</Link>
      </section>
    </div>
  );
}
