export const instant = false;
import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { SignOutButton } from "@/components/SignOutButton";
import { ReasonLogo, OperatedBy } from "@/components/Brand";
import { APP_VERSION } from "@/lib/version";
import { PendingBar } from "@/components/PendingBar";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { profile, supabase, isSuper } = await requireOperator();
  // 返事待ち（未返信の質問＋未対応のエラーレポート）。どの管理画面からでも気づけるように左メニューに出す
  const [{ count: qWait }, { count: eWait }] = await Promise.all([
    supabase.from("questions_to_operator").select("id", { count: "exact", head: true }).is("answered_at", null),
    supabase.from("error_reports").select("id", { count: "exact", head: true }).is("resolved_at", null),
  ]);
  const waiting = (qWait ?? 0) + (eWait ?? 0);
  return (
    <div className="flex-1 flex min-h-screen">
      <PendingBar stamp={Date.now()} />
      <aside className="w-[260px] shrink-0 border-r hairline px-6 py-8 flex flex-col">
        <Link href="/admin" className="block"><ReasonLogo width={212} /></Link>
        <p className="text-xs text-ink-3 mt-3">ベレネッツ管理</p>
        <nav className="mt-8 space-y-0.5 text-[15px]">
          <Link href="/admin" className="flex items-center gap-2 py-2 text-ink-2 hover:text-ink">全社一覧{waiting > 0 && <span className="attention-blink num rounded-full bg-warm text-on-accent text-[11px] font-semibold px-2 py-0.5" title="返事待ち（質問・エラーレポート）">返事待ち {waiting}</span>}</Link>
          {isSuper && <Link href="/admin/method" className="block py-2 text-ink-2 hover:text-ink">メソッド資産</Link>}
          <Link href="/admin/members" className="block py-2 text-ink-2 hover:text-ink">ベレネッツのメンバー</Link>
        </nav>
        <div className="mt-auto space-y-4">
          <div className="text-xs">
            <p className="text-ink-2 mb-1">{profile.display_name}</p>
            <SignOutButton />
          </div>
          <ThemeToggle />
          <OperatedBy />
          <p className="num text-[11px] text-ink-3">{APP_VERSION}</p>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-10 py-10"><div className="max-w-[1100px]">{children}</div></main>
    </div>
  );
}
