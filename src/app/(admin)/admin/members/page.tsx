import { requireOperator } from "@/lib/session";
import { ClearQuery } from "@/components/ClearQuery";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteOperator, resendInvite, removeOperator, setOperatorRole } from "./actions";

const OK: Record<string, string> = { invited: "追加して、招待メールを送りました。", resent: "招待メールを再送しました。", removed: "メンバーを削除しました（サインインできなくなりました）。", role: "権限を変えました。" };

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default async function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  const sp = await searchParams;
  const err = typeof sp?.error === "string" ? sp.error : null;
  const ok = typeof sp?.ok === "string" ? OK[sp.ok] ?? null : null;
  const { user, isSuper } = await requireOperator();
  const admin = createAdminClient();
  const [{ data: ops }, { data: users }] = await Promise.all([
    admin.from("profiles").select("*").eq("role", "operator").order("created_at"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const byId = new Map((users?.users ?? []).map((u) => [u.id, u]));
  const active = (ops ?? []).filter((p) => !p.disabled_at);
  const removed = (ops ?? []).filter((p) => p.disabled_at);
  const roleMissing = (ops ?? []).length > 0 && !("is_super_admin" in (ops ?? [])[0]);

  return (
    <div>
      <ClearQuery keys={["error", "ok"]} />
      <h1 className="serif text-[28px] leading-tight">ベレネッツのメンバー</h1>
      <p className="text-sm text-ink-2 mt-2 max-w-[40em]">ここに登録した人は、全社の管理画面を使えます（顧客画面には入れません）。</p>
      <dl className="mt-3 text-[13px] text-ink-2 max-w-[44em] space-y-1">
        <div><dt className="inline font-semibold text-ink">スーパー管理者</dt><dd className="inline">　管理画面のすべて＋メンバーの追加・削除・権限の変更</dd></div>
        <div><dt className="inline font-semibold text-ink">管理者</dt><dd className="inline">　管理画面のすべて（メンバーの追加・削除はできません）</dd></div>
      </dl>
      <p className="mt-3 text-[13px]">あなたの権限：<span className="font-semibold">{isSuper ? "スーパー管理者" : "管理者"}</span></p>
      {roleMissing && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[40em]">権限の設定（SQL 0017）がまだ実行されていません。実行するまで、メンバーの追加・削除はできません。</p>}
      {err && <p className="mt-4 rounded-[var(--radius)] border border-warm bg-warm-soft px-4 py-3 text-sm max-w-[40em]">{err}</p>}
      {ok && <p className="mt-4 text-sm text-navy">{ok}</p>}

      <ul className="mt-8 divide-y divide-hair max-w-[880px] text-sm">
        {active.map((p) => {
          const u = byId.get(p.id);
          return (
            <li key={p.id} className="py-3 flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="w-40 font-medium">{p.display_name}{p.id === user.id && <span className="text-ink-3 font-normal ml-1">（自分）</span>}</span>
              <span className={`text-[11px] rounded-full px-2 py-0.5 ${p.is_super_admin ? "bg-navy text-on-accent" : "border hairline text-ink-2"}`}>{p.is_super_admin ? "スーパー管理者" : "管理者"}</span>
              <span className="num text-ink-2 flex-1 min-w-[200px]">{u?.email ?? "—"}</span>
              <span className="num text-[12px] text-ink-3">最終ログイン {fmt(u?.last_sign_in_at)}</span>
              {!u?.last_sign_in_at && u?.email && (
                <form action={resendInvite}><input type="hidden" name="email" value={u.email} /><button className="btn-text" type="submit">招待を再送</button></form>
              )}
              {isSuper && p.id !== user.id && (
                <>
                  <form action={setOperatorRole}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="role" value={p.is_super_admin ? "admin" : "super"} />
                    <button className="btn-text" type="submit">{p.is_super_admin ? "管理者にする" : "スーパー管理者にする"}</button>
                  </form>
                  <details className="relative">
                    <summary className="btn-text list-none cursor-pointer text-warm">削除</summary>
                    <form action={removeOperator} className="absolute right-0 z-10 mt-1 w-64 rounded-[var(--radius)] border hairline bg-paper px-4 py-3 shadow-md">
                      <input type="hidden" name="id" value={p.id} />
                      <p className="text-[12px] text-ink-2">{p.display_name} さんを削除します。サインインできなくなります。回答や面談の記録は残ります。</p>
                      <button className="btn-primary mt-3 text-[13px]" type="submit">削除する</button>
                    </form>
                  </details>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {removed.length > 0 && (
        <details className="mt-6 max-w-[880px] text-sm text-ink-3">
          <summary className="cursor-pointer">削除したメンバー {removed.length}</summary>
          <ul className="mt-2 space-y-1">
            {removed.map((p) => <li key={p.id}>{p.display_name} <span className="num ml-2">{byId.get(p.id)?.email ?? ""}</span> <span className="num ml-2 text-[12px]">{fmt(p.disabled_at)} 削除</span></li>)}
          </ul>
          {isSuper && <p className="mt-2 text-[12px]">戻すときは、下の「追加」で同じメールアドレスを入れてください。</p>}
        </details>
      )}

      {isSuper ? (
        <>
          <h2 className="mt-12 text-sm text-ink-2">メンバーを追加</h2>
          <form action={inviteOperator} className="mt-2 flex flex-wrap gap-3 items-end max-w-[880px]">
            <label className="w-48"><span className="text-xs text-ink-2">お名前</span><input name="display_name" required className="block w-full border-b hairline py-2 text-sm" /></label>
            <label className="flex-1 min-w-[240px]"><span className="text-xs text-ink-2">メールアドレス</span><input name="email" type="email" required className="block w-full border-b hairline py-2 text-sm num" /></label>
            <label><span className="text-xs text-ink-2">権限</span>
              <select name="role" defaultValue="admin" className="block border-b hairline py-2 text-sm">
                <option value="admin">管理者</option><option value="super">スーパー管理者</option>
              </select>
            </label>
            <button className="btn-primary" type="submit">追加して招待する</button>
          </form>
          <p className="text-xs text-ink-3 mt-2">招待メールの送信元は noreply@reason-ai.wellenetz.co.jp です。届かない場合は迷惑メールフォルダを確認してもらってください。</p>
        </>
      ) : (
        <p className="mt-12 text-[13px] text-ink-3">メンバーの追加・削除は、スーパー管理者に依頼してください。</p>
      )}
    </div>
  );
}
