import { STAGES } from "@/lib/stages";

/** 面談（ベレネッツが直接行う）をステップの間に差し込む位置。key = その直後に面談が入るステップ */
const MEETING_AFTER: Record<string, string> = {
  step0: "キックオフ（3時間・代表が直接）",
  merge: "確認①（面談）",
  counter: "中間チェック（面談）",
  litmus: "確認②（面談）",
  deploy: "確認③（面談）・完成",
};

/**
 * 契約前の左メニュー：8週間で何が完成するかと、ステップ＋面談の一覧。
 * お客様の画面と、ベレネッツのプレビューで同じものを使う。
 */
export function ProgramOutline({ kickoffDone = false }: { kickoffDone?: boolean } = {}) {
  return (
    <>
      <div className="mt-5 rounded-[var(--radius)] bg-warm-soft border border-warm/40 px-3.5 py-3">
        <p className="text-[11px] font-semibold tracking-wide text-warm">8週間で完成するもの</p>
        <p className="text-[13px] leading-snug mt-1">選ばれる理由の脚本<span className="text-ink-3">（提供価値シート。広く出して、強いものに絞る）</span></p>
        <p className="text-[12px] text-ink-2 mt-1 leading-snug">＋ 営業・価格説明・Web・採用に使える原稿（すべてダウンロード可）</p>
        <p className="text-[11px] text-ink-2 mt-1.5 leading-snug">継続契約で、御社専用のブランディング・マーケティングAIへ</p>
        <p className="text-[11px] text-ink-3 mt-2 leading-snug">AIが毎日の問い、ベレネッツが5回の面談で確定</p>
      </div>
      <p className="mt-5 text-[11px] font-semibold tracking-wide text-ink-3">契約後にスタートできる8週間のステップ</p>
      <ol className="mt-1">
        {STAGES.map((s) => (
          <li key={s.key}>
            {s.key === "step0" && (
              kickoffDone
                ? <p className="flex items-center gap-2 py-[5px] pl-3 -ml-3 text-[11px] text-ink-3"><span aria-hidden>✓</span>キックオフ 終了</p>
                : <p className="flex items-center gap-2 py-[5px] pl-3 -ml-3 text-[11px] text-navy"><span aria-hidden>▶</span>{MEETING_AFTER.step0}</p>
            )}
            {kickoffDone && s.key === "step0" ? (
              <div className="rounded-[var(--radius)] border-2 border-warm bg-warm-soft px-3 py-2.5 -ml-1 my-1" title="ベレネッツが開くと、ここから始まります">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-warm"><span className="now-dot" aria-hidden />次はここから</p>
                <div className="flex items-center gap-2.5 mt-1.5">
                  <span className="num inline-block shrink-0 w-[60px] text-center rounded-full py-[3px] text-[9px] font-semibold tracking-[0.1em] leading-none bg-warm text-on-accent">{s.step}</span>
                  <span className="text-[14px] font-semibold leading-tight">{s.label}</span>
                </div>
                <p className="text-[11px] text-ink-2 mt-1.5">ベレネッツが開くと押せるようになります</p>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 py-[6px] pl-3 -ml-3 text-ink-3 opacity-60" title="契約後にスタートできます">
                <span className="num inline-block shrink-0 w-[60px] text-center rounded-full py-[3px] text-[9px] font-semibold tracking-[0.1em] leading-none border border-dashed border-ink-3">{s.step}</span>
                <span className="text-[13px] leading-tight">{s.label}</span>
              </div>
            )}
            {s.key !== "step0" && MEETING_AFTER[s.key] && (
              <p className="flex items-center gap-2 py-[5px] pl-3 -ml-3 text-[11px] text-navy"><span aria-hidden>▶</span>{MEETING_AFTER[s.key]}</p>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
