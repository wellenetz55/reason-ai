import { redirect } from "next/navigation";
export const instant = false; // サインインした人ごとの画面（事前に描かない）
import { requireUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReasonLogo, OperatedBy } from "@/components/Brand";
import { PendingBar } from "@/components/PendingBar";
import { SignOutButton } from "@/components/SignOutButton";
import { requestReaccess } from "./actions";

/** 解約した会社のお客様の画面。ベレネッツが閲覧を再開するまでは、ここだけが見える */
export default async function ClosedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { profile } = await requireUser();
  if (profile.role === "operator" || !profile.company_id) redirect("/");
  const { data: c } = await createAdminClient().from("companies").select("status, reaccess_until").eq("id", profile.company_id).maybeSingle();
  if (!c || c.status !== "cancelled" || (c.reaccess_until && new Date(c.reaccess_until) > new Date())) redirect("/");
  const sent = (await searchParams)?.sent === "1";
  return (
    <main className="flex-1 grid place-items-center px-6 py-16">
      <PendingBar stamp={Date.now()} />
      <div className="w-full max-w-md">
        <ReasonLogo width={220} />
        <h1 className="serif text-[24px] leading-snug mt-8">ご契約は終了しています</h1>
        <p className="text-sm text-ink-2 mt-3 leading-relaxed">提供価値シートなどのデータは、いまは閲覧できません。内容が必要な場合は、下のボタンからベレネッツにご依頼ください。確認のうえ、期限付きで閲覧とダウンロードができるようにします。</p>
        {sent ? (
          <p className="mt-6 rounded-[var(--radius)] bg-navy-soft px-4 py-3 text-sm">ベレネッツに依頼をお送りしました。閲覧を再開したら、この画面を開き直すとシートが見られるようになります。</p>
        ) : (
          <form action={requestReaccess} className="mt-6 space-y-3">
            <label className="block text-sm"><span className="text-xs text-ink-2">ひとこと（任意。必要な理由や期間など）</span>
              <textarea name="note" rows={3} maxLength={1000} className="mt-1 w-full border-b hairline py-1 text-sm bg-transparent" /></label>
            <button className="btn-primary" type="submit">ベレネッツに閲覧の再開を依頼する</button>
          </form>
        )}
        <div className="mt-10"><SignOutButton /></div>
        <OperatedBy className="mt-10" />
      </div>
    </main>
  );
}
