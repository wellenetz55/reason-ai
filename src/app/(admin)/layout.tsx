export const instant = false;
import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { signOut } from "@/app/login/actions";
import { ReasonLogo, OperatedBy } from "@/components/Brand";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireOperator();
  return (
    <div className="flex-1 flex min-h-screen">
      <aside className="w-[232px] shrink-0 border-r hairline px-6 py-8 flex flex-col">
        <Link href="/admin" className="block"><ReasonLogo width={150} /></Link>
        <p className="text-xs text-ink-3 mt-3">ベレネッツ管理</p>
        <nav className="mt-10 space-y-1 text-[13px]">
          <Link href="/admin" className="block py-1.5 text-ink-2 hover:text-ink">全社一覧</Link>
          <Link href="/admin/method" className="block py-1.5 text-ink-2 hover:text-ink">メソッド資産</Link>
        </nav>
        <div className="mt-auto space-y-4">
          <form action={signOut}>
            <p className="text-xs text-ink-2 mb-1">{profile.display_name}</p>
            <button className="text-xs text-ink-3 hover:text-ink">サインアウト</button>
          </form>
          <OperatedBy />
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-10 py-10"><div className="max-w-[1100px]">{children}</div></main>
    </div>
  );
}
