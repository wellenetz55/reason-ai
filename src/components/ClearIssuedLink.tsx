"use client";
import { useEffect } from "react";
import { clearIssuedLink } from "@/app/(admin)/admin/actions";

/** サインインリンクを一度表示したら、保管しているクッキーを消す */
export function ClearIssuedLink({ companyId }: { companyId: string }) {
  useEffect(() => { clearIssuedLink(companyId).catch(() => {}); }, [companyId]);
  return null;
}
