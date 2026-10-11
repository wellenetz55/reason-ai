"use client";
import { useState } from "react";
import { Upload } from "lucide-react";

/** 見つけやすいファイル選択（点線の枠。選んだファイル名を出す） */
export function FilePicker({ name, accept, hint }: { name: string; accept: string; hint: string }) {
  const [picked, setPicked] = useState<string>("");
  return (
    <label className="block cursor-pointer rounded-[var(--radius)] border-2 border-dashed border-navy/40 bg-navy-soft/40 px-5 py-6 text-center hover:border-navy transition-colors">
      <input type="file" name={name} accept={accept} className="sr-only" onChange={(e) => setPicked(e.target.files?.[0]?.name ?? "")} />
      <Upload size={22} strokeWidth={1.75} className="mx-auto text-navy" aria-hidden />
      <p className="mt-2 text-[14px] font-semibold text-navy">{picked ? `選択中：${picked}` : "ここを押してファイルを選ぶ"}</p>
      <p className="text-[12px] text-ink-3 mt-1">{hint}</p>
    </label>
  );
}
