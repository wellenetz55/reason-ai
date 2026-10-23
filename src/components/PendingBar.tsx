"use client";
import { useEffect, useRef, useState } from "react";

const WAIT = "少々お待ちください…";

/**
 * フォーム送信中の合図。
 * 押したボタンに「少々お待ちください…」を重ねて表示し（CSS: button[data-busy]）、画面上端に紺のバーと案内を出す。
 * 二度押しは、送信中のフォームの submit を止めて防ぐ。
 * ボタンの文字や disabled は書き換えない（React が描き直した新しい文言・状態を上書きしないため）。
 * `stamp` はサーバ描画のたびに変わる値。変わったら処理が終わったとみなして戻す。
 */
function clearBusy(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-busy]").forEach((el) => {
    delete el.dataset.busy;
    el.style.removeProperty("--busy-color");
  });
}

export function PendingBar({ stamp }: { stamp: number }) {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setPending(false);
    clearBusy();
    if (timer.current) clearTimeout(timer.current);
  }, [stamp]);
  useEffect(() => {
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      // クライアントで描かれたフォーム（関数の action）には method 属性が付かず form.method が "get" を返すため、属性で判定する
      if (form.getAttribute("method")?.toLowerCase() === "get") return;
      // 自前で送信中の表示をするフォーム（data-no-busy）は対象外
      if (form.dataset.noBusy) return;
      if (form.dataset.busy) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // 取り消しにくい操作は、押したボタンかフォームの data-confirm の文で確かめる
      const asked = ((e as SubmitEvent).submitter as HTMLElement | null)?.dataset.confirm ?? form.dataset.confirm;
      if (asked && !window.confirm(asked)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      setPending(true);
      form.dataset.busy = "1";
      const submitter = (e as SubmitEvent).submitter as HTMLElement | null;
      const buttons = form.querySelectorAll<HTMLButtonElement>('button[type="submit"]');
      const target = submitter ?? (buttons.length === 1 ? buttons[0] : null);
      if (target) {
        target.style.setProperty("--busy-color", getComputedStyle(target).color);
        // 幅の狭いボタン（承認・確定など）は文言を入れず「…」だけ重ねる
        target.dataset.busy = target.offsetWidth < 140 ? "short" : "1";
      }
      // 万一応答が無いときのため、一定時間で解除（長い処理は form の data-busy-timeout で延ばす）
      if (timer.current) clearTimeout(timer.current);
      const limit = Number(form.dataset.busyTimeout) || 60_000;
      timer.current = setTimeout(() => {
        setPending(false);
        clearBusy();
      }, limit);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
  if (!pending) return null;
  return (
    <div aria-live="polite" className="fixed inset-x-0 top-0 z-50 pointer-events-none">
      <div className="h-[3px] bg-navy pending-bar" />
      <p className="mt-3 mx-auto w-fit rounded-full bg-navy text-on-accent text-[13px] px-4 py-1.5 shadow-md flex items-center gap-2">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-on-accent/40 border-t-on-accent animate-spin" />
        {WAIT}
      </p>
    </div>
  );
}
