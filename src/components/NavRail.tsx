"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type S = { key: string; step: string; label: string; href: string; open: boolean; now: boolean };

/** 左の進捗レール。STEP 0〜7・FINAL のラベル、現在地の印、未到達は薄字で「順番に進む」ことを見せる */
export function NavRail({ stages }: { stages: S[] }) {
  const path = usePathname();
  return (
    <nav className="mt-8">
      <ol className="space-y-0.5">
        {stages.map((s) => {
          const active = path.startsWith(s.href);
          const inner = (
            <>
              <span className="num block text-[10px] tracking-[0.12em] leading-none">{s.step}</span>
              <span className="block text-[15px] leading-snug mt-1">
                {s.label}
                {s.now && <span className="ml-2 text-[11px] text-navy align-middle">いまここ</span>}
              </span>
            </>
          );
          const base = "block py-2 pl-3 -ml-3 border-l-2 transition-colors";
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
