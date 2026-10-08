"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type S = { key: string; step: string; label: string; href: string; open: boolean; now: boolean };

/**
 * 左の進捗レール。
 * STEP バッジ: 現在地＝紺地に白抜き／到達済み＝紺の枠線／未到達＝点線グレー。
 * バッジの色だけで「順番に進む」「いまどこか」を伝え、文字の注記は置かない。
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
                s.now
                  ? "bg-navy border-navy text-white"
                  : s.open
                    ? "border-navy text-navy"
                    : "border-dashed border-ink-3 text-ink-3"
              )}
            >
              {s.step}
            </span>
          );
          const inner = (
            <>
              {badge}
              <span className="text-[14px] leading-tight">{s.label}</span>
            </>
          );
          const base = "flex items-center gap-2.5 py-[7px] pl-3 -ml-3 border-l-2 transition-colors";
          return (
            <li key={s.key}>
              {s.open ? (
                <Link
                  href={s.href}
                  className={clsx(base, active ? "border-navy text-ink" : "border-transparent text-ink-2 hover:text-ink")}
                >
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
    </nav>
  );
}
