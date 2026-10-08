import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

/** 自社の資料ファイルを開く（署名URLへリダイレクト）。他社の id では 404 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, company } = await requireCustomer();
  const { data: doc } = await supabase.from("company_documents").select("storage_path").eq("id", id).eq("company_id", company.id).maybeSingle();
  if (!doc?.storage_path) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data } = await createAdminClient().storage.from("company-docs").createSignedUrl(doc.storage_path, 300);
  if (!data?.signedUrl) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
