"use client";
import { useEffect, useState } from "react";

/**
 * 封をした言葉を直そうとして、理由が無く保存されなかったときの合図（?seal_retry=1）。
 * 画面を開いたあとに封をされた場合など、理由欄が出ていないまま送られたときに出す。
 */
export function SealRetryNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("seal_retry")) return;
    setShow(true);
    url.searchParams.delete("seal_retry");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);
  if (!show) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-3 z-50 mx-auto w-fit max-w-[92vw] rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm shadow-md flex items-start gap-3">
      <span>保存されませんでした。確認セッションで封をした言葉です。もう一度「直す」を開き、変更の理由を書いてから確定してください。</span>
      <button type="button" className="btn-text text-xs" onClick={() => setShow(false)}>閉じる</button>
    </div>
  );
}
