"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * 左メニューの外枠。PC（md以上）は常に表示。
 * スマホでは上部にロゴと「メニュー」ボタンだけを出し、押すと開く（ページ移動で閉じる）。
 */
export function SideNav({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <div className="md:hidden print:hidden sticky top-0 z-40 bg-paper border-b hairline px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">{brand}</div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="shrink-0 rounded-full border hairline px-3 py-1 text-[13px] text-ink-2">
          {open ? "閉じる" : "メニュー"}
        </button>
      </div>
      <aside onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }} className={`${open ? "flex" : "hidden"} md:flex print:hidden w-full md:w-[260px] shrink-0 border-b md:border-b-0 md:border-r hairline px-6 py-8 flex-col`}>
        {children}
      </aside>
    </>
  );
}
