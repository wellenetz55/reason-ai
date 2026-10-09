"use client";
import { useEffect, useState } from "react";

const WAIT = "少々お待ちください…";

/**
 * フォーム送信中の合図。
 * 押したボタンの文字を「少々お待ちください…」に変え、画面上端に紺のバーと案内を出し、二度押しを防ぐ。
 * サーバ側の処理（AI下書き・メール送信など）は数秒〜数十秒かかる。
 * `stamp` はサーバ描画のたびに変わる値。変わったら処理が終わったとみなして戻す。
 */
export function PendingBar({ stamp }: { stamp: number }) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setPending(false);
    document.querySelectorAll<HTMLButtonElement>("button[data-pending]").forEach((b) => {
      b.disabled = false;
      if (b.dataset.label !== undefined) b.textContent = b.dataset.label;
      delete b.dataset.pending;
      delete b.dataset.label;
    });
  }, [stamp]);
  useEffect(() => {
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      if (form.method?.toLowerCase() === "get") return;
      setPending(true);
      const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
      form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((b) => {
        b.disabled = true;
        b.dataset.pending = "1";
        if (b === submitter || (!submitter && form.querySelectorAll('button[type="submit"]').length === 1)) {
          b.dataset.label = b.textContent ?? "";
          b.textContent = WAIT;
          b.style.minWidth = `${b.offsetWidth}px`;
        }
      });
      // 万一応答が無いときのため、60秒で解除
      setTimeout(() => {
        setPending(false);
        form.querySelectorAll<HTMLButtonElement>("button[data-pending]").forEach((b) => {
          b.disabled = false;
          if (b.dataset.label !== undefined) b.textContent = b.dataset.label;
          delete b.dataset.pending;
          delete b.dataset.label;
        });
      }, 60_000);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
  if (!pending) return null;
  return (
    <div aria-live="polite" className="fixed inset-x-0 top-0 z-50 pointer-events-none">
      <div className="h-[3px] bg-navy pending-bar" />
      <p className="mt-3 mx-auto w-fit rounded-full bg-navy text-white text-[13px] px-4 py-1.5 shadow-md flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
        {WAIT}
      </p>
    </div>
  );
}
