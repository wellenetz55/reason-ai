"use client";
import { useEffect, useRef } from "react";

/** 行が表示されてから、そのフォームを送信するまでの時間（ms）を送る。値は送信の瞬間に入れる */
export function DwellField({ since }: { since: React.RefObject<number> }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = () => {
      if (ref.current) ref.current.value = String(Math.max(1, Date.now() - since.current));
    };
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [since]);
  return <input ref={ref} type="hidden" name="dwell_ms" defaultValue="" />;
}
