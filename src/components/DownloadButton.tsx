"use client";
import { useState, type ReactNode } from "react";

/** 作るのに時間がかかるダウンロード。押したら「作成中…」にして、しばらく押せなくする */
export function DownloadButton({ href, className = "", children, method = "get" }: { href: string; className?: string; children: ReactNode; method?: "get" | "post" }) {
  const [busy, setBusy] = useState(false);
  if (method === "post") {
    // 状態を変えるダウンロード（バックアップ作成など）は POST で送る
    return (
      <form method="post" action={href} onSubmit={(e) => { if (busy) { e.preventDefault(); return; } setBusy(true); setTimeout(() => setBusy(false), 90_000); }} className="inline">
        <button type="submit" disabled={busy} className={`${className} ${busy ? "opacity-60" : ""}`}>
          {busy ? "作成中…（数十秒かかることがあります）" : children}
        </button>
      </form>
    );
  }
  return (
    <a
      href={href}
      aria-disabled={busy}
      onClick={(e) => {
        if (busy) { e.preventDefault(); return; }
        setBusy(true);
        setTimeout(() => setBusy(false), 90_000);
      }}
      className={`${className} ${busy ? "opacity-60 pointer-events-none" : ""}`}
    >
      {busy ? "作成中…（数十秒かかることがあります）" : children}
    </a>
  );
}
