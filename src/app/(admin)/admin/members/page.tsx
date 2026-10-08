import { requireOperator } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteOperator, resendInvite, removeOperator } from "./actions";

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default async function MembersPage() {
  const { user } = await requireOperator();
  const admin = createAdminClient();
  const [{ data: ops }, { data: users }] = await Promise.all([
    admin.from("profiles").select("id, display_name, created_at").eq("role", "operator").order("created_at"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const byId = new Map((users?.users ?? []).map((u) => [u.id, u]));

  return (
    <div>
      <h1 className="serif text-[28px] leading-tight">ベレネッツのメンバー</h1>
      <p className="text-sm text-ink-2 mt-2 max-w-[64ch]">ここに登録した人は、全社の管理画面を使えます（顧客画面には入れません）。招待するとマジックリンクのメールが届きます。</p>

      <ul className="mt-8 divide-y hairline max-w-[760px] text-sm">
        {(ops ?? []).map((p) => {
          const u = byId.get(p.id);
          return (
            <li key={p.id} className="py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="w-40 font-medium">{p.display_name}{p.id === user.id && <span className="text-ink-3 font-normal ml-1">（自分）</span>}</span>
              <span className="num text-ink-2 flex-1 min-w-[200px]">{u?.email ?? "—"}</span>
              <span className="num text-[12px] text-ink-3">最終ログイン {fmt(u?.last_sign_in_at)}</span>
              {!u?.last_sign_in_at && u?.email && (
                <form action={resendInvite}><input type="hidden" name="email" value={u.email} /><button className="btn-text" type="submit">招待を再送</button></form>
              )}
              {p.id !== user.id && (
                <form action={removeOperator}><input type="hidden" name="id" value={p.id} /><button className="btn-text" type="submit">外す</button></form>
              )}
            </li>
          );
        })}
      </ul>

      <form action={inviteOperator} className="mt-12 flex flex-wrap gap-3 items-end max-w-[760px]">
        <label className="w-48"><span className="text-xs text-ink-2">お名前</span><input name="display_name" required className="block w-full border-b hairline py-2 text-sm" /></label>
        <label className="flex-1 min-w-[240px]"><span className="text-xs text-ink-2">メールアドレス</span><input name="email" type="email" required className="block w-full border-b hairline py-2 text-sm num" /></label>
        <button className="btn-primary" type="submit">招待する</button>
      </form>
      <p className="text-xs text-ink-3 mt-2">招待メールの送信元は noreply@mail.app.supabase.io です。届かない場合は迷惑メールフォルダを確認してもらってください。</p>
    </div>
  );
}
