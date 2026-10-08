"use client";
import { useEffect, useState } from "react";

/** 送信フォームに、いま見ているページと環境を自動で添える（ユーザは入力しない） */
export function ClientEnv() {
  const [env, setEnv] = useState({ page: "", ua: "" });
  useEffect(() => {
    const ref = document.referrer && new URL(document.referrer).origin === location.origin ? new URL(document.referrer).pathname : "";
    setEnv({ page: ref, ua: `${navigator.userAgent} / ${window.innerWidth}×${window.innerHeight}` });
  }, []);
  return (
    <>
      <input type="hidden" name="page" value={env.page} />
      <input type="hidden" name="user_agent" value={env.ua} />
      {env.page && <p className="text-[12px] text-ink-3">直前に見ていた画面：<span className="num">{env.page}</span>（自動で添付されます）</p>}
    </>
  );
}
