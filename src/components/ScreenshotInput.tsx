"use client";
import { useRef, useState } from "react";

/** サーバが受け取れる大きさ（約4.5MB）に収まるよう、送る前にブラウザで縮める目安 */
const LIMIT = 3.5 * 1024 * 1024;
const MAX_SIDE = 2000;

/**
 * スクリーンショットの選択欄。大きい画像は、送る前にブラウザで縮小（長辺2000px・JPEG）して差し替える。
 * 大きいまま送ると、サーバに届く前に断られ、レポートの本文ごと失われるため。
 */
export function ScreenshotInput({ name }: { name: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  async function shrink(file: File): Promise<File | null> {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = url; });
      for (const [side, q] of [[MAX_SIDE, 0.85], [1600, 0.75], [1200, 0.7]] as const) {
        const r = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", q));
        if (blob && blob.size <= LIMIT) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      }
      return null;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function onChange() {
    const el = ref.current;
    const f = el?.files?.[0];
    setNote(null);
    if (!el || !f || f.size <= LIMIT) return;
    setNote("画像を縮小しています…");
    const small = await shrink(f);
    if (small) {
      const dt = new DataTransfer();
      dt.items.add(small);
      el.files = dt.files;
      setNote(`画像が大きいため縮小しました（${(small.size / 1024 / 1024).toFixed(1)}MB）。`);
    } else {
      el.value = "";
      setNote("画像が大きすぎて送れません。画面の一部だけを撮り直すか、画像なしで送ってください。");
    }
  }

  return (
    <>
      <input ref={ref} type="file" name={name} accept="image/*" onChange={onChange} className="block mt-1 text-sm file:mr-3 file:rounded-full file:border file:border-ink-3 file:bg-transparent file:px-3 file:py-1 file:text-[12px]" />
      {note && <span className="block text-[12px] text-ink-2 mt-1">{note}</span>}
    </>
  );
}
