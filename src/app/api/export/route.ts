import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/session";
import { STAGES, isStageOpen } from "@/lib/stages";
import { buildExport } from "@/server/export";

/** GET /api/export?step=brakes → そのステップまでのデータをExcelで返す */
export async function GET(req: Request) {
  const { supabase, company } = await requireCustomer();
  const url = new URL(req.url);
  const step = url.searchParams.get("step") ?? "step0";
  const stage = STAGES.find((s) => s.key === step);
  if (!stage || !isStageOpen(stage, company.status)) return NextResponse.json({ error: "not available" }, { status: 403 });
  const buf = await buildExport(supabase, company.id, company.name, company.status, step);
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()).replace(/-/g, "");
  const filename = encodeURIComponent(`提供価値シート_${company.name}_${stage.step.replace(" ", "")}_${date}.xlsx`);
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
