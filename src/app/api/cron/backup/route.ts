import { NextResponse } from "next/server";
import { backupToDropbox, getSetting } from "@/server/dropbox";
import { notifyOperators } from "@/server/notify";

export const maxDuration = 300;

/** 毎週の自動バックアップ（Vercel Cron）。Dropbox と未接続なら何もしない */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await getSetting("dropbox"))) return NextResponse.json({ ok: true, skipped: "not connected" });
  const r = await backupToDropbox("schedule");
  if (!r.ok || r.error) {
    await notifyOperators({
      onlySuper: true,
      subject: r.ok ? "自動バックアップの一部が読めませんでした" : "自動バックアップに失敗しました",
      lines: [r.ok ? "毎週の Dropbox への自動バックアップは保存しましたが、一部のデータが読めませんでした。" : "毎週の Dropbox への自動バックアップに失敗しました。", `内容：${r.error ?? "不明"}`, "管理画面の「ベレネッツのメンバー」→「全データのバックアップ」で確かめ、必要なら「今すぐDropboxに保存」を押してください。"],
      path: "/admin/members#backup",
    });
  }
  return NextResponse.json({ ok: r.ok });
}
