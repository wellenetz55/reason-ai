"use client";
import { useEffect, useState } from "react";

/**
 * フォーム送信中の合図。画面上端に細い紺のバーを出し、送信ボタンを押せなくする。
 * サーバ側の処理（AI下書きなど）は数秒〜数十秒かかるので、二度押しを防ぐ。
 * `stamp` はサーバ描画のたびに変わる値。変わったら処理が終わったとみなして消す。
 */
export function PendingBar({ stamp }: { stamp: number }) {
  const [pending, setPending] = useState(false);
  useEffect(() => { setPending(false); }, [stamp]);
  useEffect(() => {
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      if (form.method?.toLowerCase() === "get") return;
      setPending(true);
      form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((b) => { b.disabled = true; b.dataset.pending = "1"; });
      // 万一応答が無いときのため、60秒で解除
      setTimeout(() => { setPending(false); form.querySelectorAll<HTMLButtonElement>('button[data-pending]').forEach((b) => { b.disabled = false; delete b.dataset.pending; }); }, 60_000);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
  if (!pending) return null;
  return (
    <div aria-live="polite" className="fixed inset-x-0 top-0 z-50 pointer-events-none">
      <div className="h-[3px] bg-navy pending-bar" />
      <p className="mt-2 ml-auto mr-4 w-fit rounded-full bg-navy text-white text-[12px] px-3 py-1 shadow-sm">処理中…</p>
    </div>
  );
}
