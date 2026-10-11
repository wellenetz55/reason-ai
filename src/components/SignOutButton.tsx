"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";

/** 1クリックで抜けないように、その場で確認を出す */
export function SignOutButton() {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 rounded-full border border-ink-2/50 px-3.5 py-1.5 text-[13px] font-medium text-ink hover:border-ink hover:text-ink hover:bg-paper-2 transition-colors">
        <LogOut size={14} strokeWidth={1.9} aria-hidden />サインアウト
      </button>
    );
  }
  return (
    <div className="rounded-[var(--radius)] bg-paper-2 px-3 py-2.5 -mx-1">
      <p className="text-[13px] text-ink">本当にサインアウトしますか？</p>
      <div className="mt-2 flex gap-2">
        <form action={signOut}><button type="submit" className="btn-primary text-[13px] px-3 py-1">サインアウト</button></form>
        <button type="button" onClick={() => setConfirming(false)} className="btn-text">やめる</button>
      </div>
    </div>
  );
}
