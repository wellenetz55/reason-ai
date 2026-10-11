import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBackup } from "@/server/backup";

export const maxDuration = 60;

/** GET /api/admin/backup — スーパー管理者のみ。全データを1つのZIPにして返す */
export async function GET() {
  const { user } = await requireSuperAdmin();
  const admin = createAdminClient();
  const b = await buildBackup(admin);
  await admin.from("activity_log").insert({ company_id: null, user_id: user.id, event: "admin.backup", payload: { tables: b.tables, files: b.fileCount } });
  return new NextResponse(b.zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(b.filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
