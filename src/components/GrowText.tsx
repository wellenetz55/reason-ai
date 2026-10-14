"use client";
import { useEffect, useRef, type TextareaHTMLAttributes } from "react";

/** 1行の入力欄の見た目で、文が長くなると折り返して全文が見える textarea（Enter で改行はしない） */
export function GrowText(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = "0px"; el.style.height = el.scrollHeight + "px"; };
  useEffect(() => { fit(); }, []);
  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      onInput={(e) => { fit(); props.onInput?.(e); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); props.onKeyDown?.(e); }}
      className={(props.className ?? "") + " resize-none overflow-hidden leading-relaxed"}
    />
  );
}
