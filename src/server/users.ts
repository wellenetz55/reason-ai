import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * 認証ユーザーを全件読む（1,000人ずつページをめくる）。listUsers は1ページ分しか返さないため、
 * 人数が増えても招待の重複確認・通知の宛先が漏れないようにする。戻り値は listUsers と同じ形。
 */
export async function listAllUsers(admin: SupabaseClient): Promise<{ data: { users: User[] } }> {
  const users: User[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return { data: { users } };
}
