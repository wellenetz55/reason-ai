import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sealOn, type Seal } from "@/lib/seals";
import { cut, nl } from "@/lib/limits";
import { redirect } from "next/navigation";

/** その会社の封（新しい順） */
export async function loadSeals(supabase: SupabaseClient, companyId: string): Promise<Seal[]> {
  const { data } = await supabase.from("sheet_locks").select("id, session, columns, locked_at, is_provisional").eq("company_id", companyId).order("locked_at", { ascending: false });
  return (data ?? []) as Seal[];
}

/**
 * 封をした列を変えてよいかを確かめ、変える場合は理由を記録する。
 * 封が無い・仮封・封より後に作った行なら true（記録なし）。
 * 封があるのに理由が空なら false（呼び出し側は何もしない）。理由があれば sheet_lock_history に残して true。
 */
export async function sealGate(opts: {
  supabase: SupabaseClient; companyId: string; userId: string; formData?: FormData;
  changes: { column: string; rowId: string | null; createdAt: string | null; before: string | null; after: string | null; tag?: string | null }[];
}): Promise<boolean> {
  // 空だった欄を埋めるのは「封をした言葉を変える」ことではないので、理由は要らない
  const real = opts.changes.filter((c) => nl(c.before).trim() !== "" && nl(c.before).trim() !== nl(c.after).trim());
  if (!real.length) return true;
  const seals = await loadSeals(opts.supabase, opts.companyId);
  const hits = real.map((c) => ({ c, s: sealOn(seals, c.column, c.createdAt, c.tag) })).filter((x) => x.s);
  if (!hits.length) return true;
  const reason = cut(String(opts.formData?.get("seal_reason") ?? "").trim(), 1000);
  if (!reason) return false;
  // 変更の記録はベレネッツの表（お客様のロールでは書けない）。会社の行であることは呼び出し側で確かめ済み
  await createAdminClient().from("sheet_lock_history").insert(hits.map(({ c, s }) => ({
    lock_id: s!.id, row_id: c.rowId, column_key: c.column, before_text: c.before, after_text: c.after, reason, changed_by: opts.userId,
  })));
  return true;
}

/** 行・ブレーキが封の対象か（理由つきの「直す」以外の操作を止めるため） */
export async function isSealed(supabase: SupabaseClient, companyId: string, column: string, createdAt: string | null, tag?: string | null): Promise<boolean> {
  return !!sealOn(await loadSeals(supabase, companyId), column, createdAt, tag);
}

/** 封をした言葉に理由が無く保存しなかったとき、その画面に戻して合図を出す（黙って何も起きないように） */
export function sealRetry(path: string): never {
  redirect(`${path}?seal_retry=1`);
}
