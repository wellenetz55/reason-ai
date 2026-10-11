"use client";
import { useEffect } from "react";

/**
 * 「保存しました」などの一度きりの合図をURLから外す。
 * 表示はそのまま残り、次に別の操作をして画面が描き直されたときに消える（URLに残って出続けないように）。
 */
export function ClearQuery({ keys }: { keys: string[] }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    for (const k of keys) {
      if (url.searchParams.has(k)) {
        url.searchParams.delete(k);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [keys]);
  return null;
}
