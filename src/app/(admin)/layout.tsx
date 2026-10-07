export const instant = false;
import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { signOut } from "@/app/login/actions";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireOperator();
  return (
    <div className="flex-1 flex min-h-screen">
      <aside className="w-[232px] shrink-0 border-r hairline px-6 py-8 flex flex-col">
        <Link href="/admin" className="serif text-[17px]">ベレネッツ管理</Link>
        <nav className="mt-10 space-y-1 text-[13px]">
          <Link href="/admin" className="block py-1.5 text-ink-2 hover:text-ink">全社一覧</Link>
          <Link href="/admin/method" className="block py-1.5 text-ink-2 hover:text-ink">メソッド資産</Link>
        </nav>
        <form action={signOut} className="mt-auto">
          <button className="text-xs text-ink-3 hover:text-ink">{profile.display_name ?? "サインアウト"}</button>
        </form>
      </aside>
      <main className="flex-1 min-w-0 px-10 py-10"><div className="max-w-[1100px]">{children}</div></main>
    </div>
  );
}
