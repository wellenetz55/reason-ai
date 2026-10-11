"use client";
import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
const OPTIONS: { v: Theme; label: string; title: string }[] = [
  { v: "light", label: "ライト", title: "明るい表示" },
  { v: "dark", label: "ダーク", title: "暗い表示" },
  { v: "system", label: "自動", title: "端末の設定に合わせる" },
];

// 現在の表示は <html data-theme> が正（ThemeScript が描画前に入れる）
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const read = (): Theme => {
  const v = document.documentElement.dataset.theme;
  return v === "dark" || v === "system" ? v : "light";
};

/** 表示の明るさを切り替える。選んだものはクッキーに残す */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const choose = (v: Theme) => {
    window.document.documentElement.dataset.theme = v;
    window.document.cookie = `theme=${v}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div role="radiogroup" aria-label="表示の明るさ" className={`inline-flex rounded-full border hairline p-0.5 text-[11px] ${className}`}>
      {OPTIONS.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={theme === o.v}
          title={o.title}
          onClick={() => choose(o.v)}
          className={`rounded-full px-2.5 py-0.5 ${theme === o.v ? "bg-navy text-on-accent" : "text-ink-3 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

