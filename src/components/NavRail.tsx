"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

type S = { key: string; label: string; href: string; open: boolean };

export function NavRail({ stages }: { stages: S[] }) {
  const path = usePathname();
  return (
    <nav className="mt-10 space-y-1">
      {stages.map((s) => {
        const active = path.startsWith(s.href);
        return s.open ? (
          <Link
            key={s.key}
            href={s.href}
            className={clsx(
              "block text-[13px] py-1.5 pl-3 -ml-3 border-l-2 transition-colors",
              active ? "border-navy text-ink" : "border-transparent text-ink-2 hover:text-ink"
            )}
          >
            {s.label}
          </Link>
        ) : (
          <span key={s.key} className="block text-[13px] py-1.5 pl-3 -ml-3 border-l-2 border-transparent text-ink-3">
            {s.label}
          </span>
        );
      })}
    </nav>
  );
}
