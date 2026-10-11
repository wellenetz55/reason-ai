import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBackup } from "@/server/backup";

/** バックアップを残す数（古いものから消す） */
export const KEEP = 12;

type DropboxConn = { refresh_token: string; account_email?: string; connected_at: string };
export type BackupLast = { at: string; ok: boolean; path?: string; error?: string; by: "schedule" | "manual" };

export async function getSetting<T>(key: string): Promise<T | null> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}
export async function setSetting(key: string, value: unknown) {
  const { error } = await createAdminClient().from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`設定を保存できませんでした（SQL 0018 が未実行の可能性があります）：${error.message}`);
}
export async function deleteSetting(key: string) {
  const { error } = await createAdminClient().from("app_settings").delete().eq("key", key);
  if (error) throw new Error(`設定を消せませんでした：${error.message}`);
}

export const dropboxConfigured = () => !!(process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET);
export const redirectUri = () => `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/dropbox/callback`;

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: process.env.DROPBOX_APP_KEY!, client_secret: process.env.DROPBOX_APP_SECRET! }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Dropbox の認証に失敗しました（${res.status} ${j.error_description ?? j.error ?? ""}）`);
  return j as { access_token: string; refresh_token?: string };
}

/** 認可コードを受け取り、更新用トークンを保存する */
export async function connectWithCode(code: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Dropbox から更新用トークンが返りませんでした");
  let email: string | undefined;
  const me = await fetch("https://api.dropboxapi.com/2/users/get_current_account", { method: "POST", headers: { authorization: `Bearer ${t.access_token}` } });
  if (me.ok) email = (await me.json()).email;
  await setSetting("dropbox", { refresh_token: t.refresh_token, account_email: email, connected_at: new Date().toISOString() } satisfies DropboxConn);
}

// ヘッダに載せる JSON は ASCII のみ（日本語は \uXXXX にする）
const asciiJson = (o: unknown) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

async function api(token: string, endpoint: string, body: unknown) {
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Dropbox ${endpoint} 失敗（${res.status} ${await res.text().catch(() => "")}）`);
  return res.json();
}

/** 全データのZIPを作って Dropbox（アプリ専用フォルダ）に置き、古いものを消す。結果を記録して返す */
export async function backupToDropbox(by: BackupLast["by"]): Promise<BackupLast> {
  const at = new Date().toISOString();
  let last: BackupLast;
  try {
    if (!dropboxConfigured()) throw new Error("Vercel に DROPBOX_APP_KEY / DROPBOX_APP_SECRET が設定されていません");
    const conn = await getSetting<DropboxConn>("dropbox");
    if (!conn?.refresh_token) throw new Error("Dropbox と接続されていません");
    const { access_token } = await tokenRequest({ grant_type: "refresh_token", refresh_token: conn.refresh_token });
    const b = await buildBackup(createAdminClient());
    const path = `/${b.filename}`;
    const up = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${access_token}`,
        "content-type": "application/octet-stream",
        "Dropbox-API-Arg": asciiJson({ path, mode: "add", autorename: true, mute: true }),
      },
      body: b.zip as unknown as BodyInit,
    });
    if (!up.ok) throw new Error(`アップロードに失敗しました（${up.status} ${await up.text().catch(() => "")}）`);
    const saved = await up.json();
    // 古いバックアップを消す（新しい KEEP 個だけ残す）
    try {
      const list = await api(access_token, "files/list_folder", { path: "" });
      const zips = (list.entries as { ".tag": string; name: string; path_lower: string; server_modified: string }[])
        .filter((e) => e[".tag"] === "file" && e.name.startsWith("選ばれる理由AI_バックアップ_") && e.name.endsWith(".zip"))
        .sort((a, b) => b.server_modified.localeCompare(a.server_modified));
      for (const old of zips.slice(KEEP)) await api(access_token, "files/delete_v2", { path: old.path_lower });
    } catch (e) {
      console.error("dropbox cleanup", e);
    }
    last = { at, ok: true, path: saved.path_display ?? path, by, ...(b.problems.length ? { error: `一部読めませんでした：${b.problems.join(" / ")}` } : {}) };
  } catch (e) {
    last = { at, ok: false, error: e instanceof Error ? e.message : String(e), by };
  }
  await setSetting("backup_last", last).catch(() => {});
  return last;
}
