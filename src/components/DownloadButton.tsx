"use client";
import { useState, type ReactNode } from "react";

/** 作るのに時間がかかるダウンロード。押したら「作成中…」にして、しばらく押せなくする */
export function DownloadButton({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
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
