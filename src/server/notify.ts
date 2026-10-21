import { listAllUsers } from "@/server/users";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtMeeting } from "@/lib/meetings";

const FROM = "選ばれる理由AI（ベレネッツ） <noreply@reason-ai.wellenetz.co.jp>";

/** オペレータ全員のメールアドレス */
async function operatorEmails(onlySuper = false): Promise<string[]> {
  const admin = createAdminClient();
  const { data: ops } = await admin.from("profiles").select("*").eq("role", "operator");
  const ids = new Set((ops ?? []).filter((p) => !p.disabled_at && (!onlySuper || p.is_super_admin)).map((p) => p.id));
  if (ids.size === 0) return [];
  const { data: list } = await listAllUsers(admin);
  return (list?.users ?? []).filter((u) => ids.has(u.id) && u.email).map((u) => u.email!);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/**
 * 運営向けの即時通知メール（Resend）。失敗してもアプリの処理は止めない。
 * 本文に手法名・内部タグ名を含めないこと（spec 06）。
 */
export async function notifyOperators(opts: { subject: string; lines: string[]; path: string; onlySuper?: boolean }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    const to = await operatorEmails(!!opts.onlySuper);
    if (to.length === 0) return;
    const url = `${process.env.NEXT_PUBLIC_APP_URL}${opts.path}`;
    const html = `<div style="font-family:'Noto Sans JP',system-ui,sans-serif;font-size:14px;line-height:1.7;color:#1c1c1e">
${opts.lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join("\n")}
<p style="margin:16px 0 0"><a href="${url}" style="color:#1e2a5a">管理画面で開く</a></p>
<p style="margin:24px 0 0;font-size:12px;color:#666">選ばれる理由AI 運営通知 · ${esc(fmtMeeting(new Date().toISOString()))}</p>
</div>`;
    const text = `${opts.lines.join("\n")}\n\n管理画面で開く: ${url}`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject: `【選ばれる理由AI】${opts.subject}`, html, text }),
    });
    if (!res.ok) console.error("notifyOperators failed", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("notifyOperators error", e);
  }
}

/**
 * 顧客1人あての案内メール（Resend）。失敗してもアプリの処理は止めない。
 * 本文に手法名・内部タグ名を含めないこと（spec 06）。
 */
export async function notifyCustomer(opts: { to: string; subject: string; lines: string[]; path?: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !opts.to) return;
  try {
    const url = opts.path ? `${process.env.NEXT_PUBLIC_APP_URL}${opts.path}` : null;
    const html = `<div style="font-family:'Noto Sans JP',system-ui,sans-serif;font-size:14px;line-height:1.8;color:#1c1c1e">
${opts.lines.map((l) => (l === "" ? `<p style="margin:0 0 8px">&nbsp;</p>` : `<p style="margin:0 0 8px">${esc(l)}</p>`)).join("\n")}
${url ? `<p style="margin:16px 0 0"><a href="${url}" style="color:#1e2a5a">選ばれる理由AIを開く</a></p>` : ""}
<p style="margin:24px 0 0;font-size:12px;color:#666">選ばれる理由AI · 運営 株式会社ベレネッツ · www.wellenetz.co.jp<br>このメールは送信専用です。ご質問はアプリの「ベレネッツに質問を残す」からお送りください。</p>
</div>`;
    const text = `${opts.lines.join("\n")}${url ? `\n\n選ばれる理由AIを開く: ${url}` : ""}\n\n選ばれる理由AI · 運営 株式会社ベレネッツ · www.wellenetz.co.jp\nこのメールは送信専用です。ご質問はアプリの「ベレネッツに質問を残す」からお送りください。`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [opts.to], subject: `【選ばれる理由AI】${opts.subject}`, html, text }),
    });
    if (!res.ok) console.error("notifyCustomer failed", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("notifyCustomer error", e);
  }
}

/** その会社の担当者（お客様）のメールアドレス */
export async function customerEmails(companyId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: ps } = await admin.from("profiles").select("id, disabled_at").eq("company_id", companyId).neq("role", "operator");
  const ids = new Set((ps ?? []).filter((p) => !p.disabled_at).map((p) => p.id));
  if (ids.size === 0) return [];
  const { data: list } = await listAllUsers(admin);
  return (list?.users ?? []).filter((u) => ids.has(u.id) && u.email).map((u) => u.email!);
}
