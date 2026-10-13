"use client";
import { useState } from "react";

/** 会社名をそのまま入れたときだけ「リセットする」を押せる（押し間違い防止。サーバー側でも同じ確認をする） */
export function ResetConfirm({ name }: { name: string }) {
  const [v, setV] = useState("");
  const ok = v.trim() === name.trim();
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="font-semibold">確認のため、会社名をそのまま入力してください</span>
        <span className="block text-xs text-ink-3 mt-0.5 break-all">「{name}」</span>
        <input name="confirm_name" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" className="mt-2 block w-full max-w-[32em] border-b hairline py-2 text-sm bg-transparent" />
      </label>
      <button type="submit" disabled={!ok} className="rounded-[var(--radius)] bg-warm text-on-accent px-5 py-2.5 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110">
        控えを保存してリセットする
      </button>
    </div>
  );
}
