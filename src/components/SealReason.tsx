"use client";
import { useEffect, useRef } from "react";

/**
 * 封をした言葉を直すときの「変更の理由」欄。封のある組・ブレーキの「直す」フォームの中に置く。
 * 理由が要るのは、フォームの文（textarea・文字入力・根拠の選択）を開いたときから変えたときだけ。
 * 同じ文のまま「決定」を押したときや、封の対象でない欄（当社しか・根拠の種類のチェックなど）だけを変えたときは、理由なしで送れる。
 * optional：同じフォームに封の対象でない文の欄もあるとき。空のまま封の対象を変えると、サーバが保存せず合図を出す。
 */
export function SealReason({ label, optional = false }: { label?: string; optional?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = ref.current;
    const form = ta?.form;
    if (!ta || !form || optional) return;
    // 開いたときの文を覚えておく（理由の欄そのものは除く）
    const fields = () => Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("textarea, input[type=text], select"))
      .filter((el) => el.name && el.name !== "seal_reason");
    const initial = new Map(fields().map((el) => [el, el.value.replace(/\r\n/g, "\n").trim()]));
    const onSubmit = (e: SubmitEvent) => {
      const changed = fields().some((el) => (initial.get(el) ?? "") !== el.value.replace(/\r\n/g, "\n").trim());
      if (!changed || ta.value.trim()) { ta.setCustomValidity(""); return; }
      e.preventDefault();
      e.stopPropagation();
      ta.setCustomValidity("変更の理由を書いてください");
      ta.reportValidity();
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [optional]);
  return (
    <label className="block mt-2 rounded-[var(--radius)] border border-navy/30 bg-navy-soft px-3 py-2">
      <span className="text-[11px] font-semibold text-navy"><span aria-hidden="true">🔒 </span>{label ?? "確認セッションで封をした言葉です。"}変更の理由（文を変えるときは必須）</span>
      <textarea
        ref={ref}
        name="seal_reason" rows={2} maxLength={1000}
        className="mt-1 w-full border-b hairline py-1 text-[13px] bg-transparent"
        placeholder="例：お客様3社に聞いたところ、この言い方の方が伝わったため"
        onInput={(e) => e.currentTarget.setCustomValidity("")}
      />
      <span className="block text-[11px] text-ink-3 mt-0.5">理由と変更前後は、ベレネッツに記録として共有されます。</span>
    </label>
  );
}

/** 封の印（組・ブレーキの見出しに出す） */
export function SealBadge({ label }: { label: string }) {
  return <span className="inline-flex items-center gap-1 text-[11px] text-navy font-semibold whitespace-nowrap"><span aria-hidden="true">🔒</span> {label}で封<span className="sr-only">（確認セッションで確定した言葉です。直すときは理由を書いてください）</span></span>;
}
