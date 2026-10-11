import { NextResponse } from "next/server";
import { backupToDropbox, getSetting } from "@/server/dropbox";
import { notifyOperators } from "@/server/notify";

export const maxDuration = 60;

/** 毎週の自動バックアップ（Vercel Cron）。Dropbox と未接続なら何もしない */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await getSetting("dropbox"))) return NextResponse.json({ ok: true, skipped: "not connected" });
  const r = await backupToDropbox("schedule");
  if (!r.ok) {
    await notifyOperators({ subject: "自動バックアップに失敗しました", lines: ["毎週の Dropbox への自動バックアップに失敗しました。", `理由：${r.error ?? "不明"}`, "管理画面の「ベレネッツのメンバー」→「全データのバックアップ」で、接続を確かめてから「今すぐDropboxに保存」を押してください。"], path: "/admin/members#backup" });
  }
  return NextResponse.json({ ok: r.ok });
}
