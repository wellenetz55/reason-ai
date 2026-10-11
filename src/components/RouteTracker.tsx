"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** アプリ内の画面移動を記録し、エラーレポートの「直前に見ていた画面」に使う（document.referrer はアプリ内遷移で更新されないため） */
export function RouteTracker() {
  const path = usePathname();
  useEffect(() => {
    try {
      const cur = sessionStorage.getItem("ra:curPath");
      if (cur && cur !== path) sessionStorage.setItem("ra:prevPath", cur);
      sessionStorage.setItem("ra:curPath", path);
    } catch {}
  }, [path]);
  return null;
}
