import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBackup } from "@/server/backup";

export const maxDuration = 300;

/**
 * GET /api/admin/backup — スーパー管理者のみ。全データを1つのZIPにする。
 * 関数の応答には大きさの上限（約4.5MB）があるため、非公開の backups バケットに置いて、5分だけ有効なURLへ転送する。
 */
export async function GET() {
  const { user } = await requireSuperAdmin();
  const admin = createAdminClient();
  const b = await buildBackup(admin);
  await admin.from("activity_log").insert({ company_id: null, user_id: user.id, event: "admin.backup", payload: { tables: b.tables, files: b.fileCount } });

  // 前回の一時ファイルは消す（置きっぱなしにしない）
  const { data: olds } = await admin.storage.from("backups").list("downloads", { limit: 100 });
  if (olds?.length) await admin.storage.from("backups").remove(olds.map((o) => `downloads/${o.name}`));
  const key = `downloads/backup_${Date.now()}.zip`;
  const { error } = await admin.storage.from("backups").upload(key, b.zip, { contentType: "application/zip", upsert: true });
  if (!error) {
    const { data: signed } = await admin.storage.from("backups").createSignedUrl(key, 300, { download: b.filename });
    if (signed?.signedUrl) return NextResponse.redirect(signed.signedUrl);
  }
  // バケットが無い（SQL 0019 未実行）ときは、小さければ直接返す
  if (b.zip.byteLength < 4_000_000) {
    return new NextResponse(b.zip as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(b.filename)}`,
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/members?error=${encodeURIComponent("バックアップが大きいため直接渡せません。SQL 0019（backups バケット）を実行してください：" + (error?.message ?? ""))}#backup`);
}
