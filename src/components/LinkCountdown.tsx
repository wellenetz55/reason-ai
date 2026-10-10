"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/** サインイン用リンクの残り時間（送信時刻 sentAt から limitSec 秒）。表示だけで、実際の失効は Supabase 側の設定で行う */
export function LinkCountdown({ sentAt, limitSec = 300 }: { sentAt: number; limitSec?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((sentAt + limitSec * 1000 - now) / 1000));
  if (left === 0) {
    return (
      <p className="rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-[13px]">
        リンクの有効期限（5分）が過ぎました。<Link href="/login" className="text-warm font-semibold underline underline-offset-4">もう一度メールアドレスを入力してください</Link>。
      </p>
    );
  }
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return (
    <p className="text-[13px] text-ink-2">
      リンクの有効期限は<strong className="text-ink">5分</strong>です。残り <span className="num font-semibold text-ink">{mm}:{ss}</span>
    </p>
  );
}
