export const instant = false;
import Link from "next/link";
import { requireOperator } from "@/lib/session";
import { SignOutButton } from "@/components/SignOutButton";
import { ReasonLogo, OperatedBy } from "@/components/Brand";
import { APP_VERSION } from "@/lib/version";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireOperator();
  return (
    <div className="flex-1 flex min-h-screen">
      <aside className="w-[260px] shrink-0 border-r hairline px-6 py-8 flex flex-col">
        <Link href="/admin" className="block"><ReasonLogo width={212} /></Link>
        <p className="text-xs text-ink-3 mt-3">ベレネッツ管理</p>
        <nav className="mt-8 space-y-0.5 text-[15px]">
          <Link href="/admin" className="block py-2 text-ink-2 hover:text-ink">全社一覧</Link>
          <Link href="/admin/method" className="block py-2 text-ink-2 hover:text-ink">メソッド資産</Link>
          <Link href="/admin/members" className="block py-2 text-ink-2 hover:text-ink">ベレネッツのメンバー</Link>
        </nav>
        <div className="mt-auto space-y-4">
          <div className="text-xs">
            <p className="text-ink-2 mb-1">{profile.display_name}</p>
            <SignOutButton />
          </div>
          <OperatedBy />
          <p className="num text-[11px] text-ink-3">{APP_VERSION}</p>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-10 py-10"><div className="max-w-[1100px]">{children}</div></main>
    </div>
  );
}
