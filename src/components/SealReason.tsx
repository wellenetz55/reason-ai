"use client";

/** 封をした言葉を直すときの「変更の理由」欄（必須）。封のある組・ブレーキの「直す」フォームの中に置く */
export function SealReason({ label, optional = false }: { label?: string; optional?: boolean }) {
  // optional：同じフォームに封の対象でない欄もあるとき（変えたときだけ理由が要る。空のまま封の対象を変えると、保存されず合図が出る）
  return (
    <label className="block mt-2 rounded-[var(--radius)] border border-navy/30 bg-navy-soft px-3 py-2">
      <span className="text-[11px] font-semibold text-navy"><span aria-hidden="true">🔒 </span>{label ?? "確認セッションで封をした言葉です。"}変更の理由（{optional ? "変えるときは必須" : "必須"}）</span>
      <textarea
        name="seal_reason" required={!optional} rows={2} maxLength={1000}
        className="mt-1 w-full border-b hairline py-1 text-[13px] bg-transparent"
        placeholder="例：お客様3社に聞いたところ、この言い方の方が伝わったため"
        // 空白だけの理由はサーバで空として扱われ、保存されないため、送る前に止める
        onInput={(e) => e.currentTarget.setCustomValidity(optional || e.currentTarget.value.trim() ? "" : "変更の理由を書いてください")}
        onInvalid={(e) => { if (!optional && !e.currentTarget.value.trim()) e.currentTarget.setCustomValidity("変更の理由を書いてください"); }}
      />
      <span className="block text-[11px] text-ink-3 mt-0.5">理由と変更前後は、ベレネッツに記録として共有されます。</span>
    </label>
  );
}

/** 封の印（組・ブレーキの見出しに出す） */
export function SealBadge({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-1 text-[11px] text-navy font-semibold whitespace-nowrap" title="確認セッションで確定した言葉です。直すときは理由を書いてください"><span aria-hidden="true">🔒</span> {label}で封</span>;
}
