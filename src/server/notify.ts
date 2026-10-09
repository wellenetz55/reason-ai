import { createAdminClient } from "@/lib/supabase/admin";
import { fmtMeeting } from "@/lib/meetings";

const FROM = "選ばれる理由AI（ベレネッツ） <noreply@reason-ai.wellenetz.co.jp>";

/** オペレータ全員のメールアドレス */
async function operatorEmails(): Promise<string[]> {
  const admin = createAdminClient();
  const { data: ops } = await admin.from("profiles").select("id").eq("role", "operator");
  const ids = new Set((ops ?? []).map((p) => p.id));
  if (ids.size === 0) return [];
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (list?.users ?? []).filter((u) => ids.has(u.id) && u.email).map((u) => u.email!);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/**
 * 運営向けの即時通知メール（Resend）。失敗してもアプリの処理は止めない。
 * 本文に手法名・内部タグ名を含めないこと（spec 06）。
 */
export async function notifyOperators(opts: { subject: string; lines: string[]; path: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    const to = await operatorEmails();
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
