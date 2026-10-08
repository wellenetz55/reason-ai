"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type S = { key: string; step: string; label: string; href: string; open: boolean; now: boolean };

/**
 * 左の進捗レール。
 * バッジ: 開いているページ＝紺地に白抜き／開ける段階＝紺の枠線／未到達＝点線グレー。
 * プログラム上「いま進める段階」は、段階名の右に小さなオレンジの点（ホバーで説明）。
 * 「開いているページ」と「いまの段階」を混ぜない。
 */
export function NavRail({ stages }: { stages: S[] }) {
  const path = usePathname();
  return (
    <nav className="mt-6">
      <ol className="space-y-0">
        {stages.map((s) => {
          const active = path.startsWith(s.href);
          const badge = (
            <span
              className={clsx(
                "num inline-block shrink-0 w-[60px] text-center rounded-full py-[3px] text-[9px] font-semibold tracking-[0.1em] leading-none border",
                active ? "bg-navy border-navy text-white" : s.open ? "border-navy text-navy" : "border-dashed border-ink-3 text-ink-3"
              )}
            >
              {s.step}
            </span>
          );
          const inner = (
            <>
              {badge}
              <span className="text-[14px] leading-tight flex items-center gap-1.5">
                {s.label}
                {s.now && <span className="now-dot ml-1" title="いま進める段階" aria-label="いま進める段階" />}
              </span>
            </>
          );
          const base = "flex items-center gap-2.5 py-[7px] pl-3 -ml-3 border-l-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-navy rounded-sm";
          return (
            <li key={s.key}>
              {s.open ? (
                <Link href={s.href} className={clsx(base, active ? "border-navy text-ink" : "border-transparent text-ink-2 hover:text-ink")}>
                  {inner}
                </Link>
              ) : (
                <span className={clsx(base, "border-transparent text-ink-3")} title="前の段階が終わると開きます">
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11px] text-ink-3 flex items-center gap-2"><span className="now-dot" />いま進める段階</p>
    </nav>
  );
}
