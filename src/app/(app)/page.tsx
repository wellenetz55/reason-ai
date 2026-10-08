import Link from "next/link";
import { requireCustomer } from "@/lib/session";
import { STAGES } from "@/lib/stages";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("ja-JP", { hour: "numeric", hour12: false, timeZone: "Asia/Tokyo" }).format(new Date()));
  if (h >= 5 && h < 10) return "おはようございます";
  if (h >= 10 && h < 17) return "こんにちは";
  return "こんばんは";
}

/** 状態ごとの「いま進めること」。段階名と、何をする画面かを一文で。 */
function currentStep(status: string, rows: number) {
  switch (status) {
    case "onboarding":
      return { key: "step0", title: "会社資料を上げる", body: "会社案内やWebサイトを登録すると、AIが御社の説明の下書きを作ります。それを直すところから始まります。" };
    case "week1_2":
      return rows < 20
        ? { key: "diverge", title: "提供価値を出す", body: `御社が「できること」を思いつく限り書き出す段階です。あと${20 - rows}行で次に進めます（目標30行）。` }
        : { key: "merge", title: "まとめて絞る", body: `提供価値が${rows}行そろいました。似たものをまとめ、残す言葉を選ぶ段階です。` };
    case "week3_5":
      return { key: "brakes", title: "お客様のブレーキを書き出す", body: "お客様が御社を選ぶ直前に感じる不安や迷いを書き出し、先回りの答えを用意する段階です。" };
    case "week6_8":
    case "extended":
      return { key: "evidence", title: "証拠を集める", body: "ここまで決めた言葉の裏づけ（お客様の声・数字・事実）を集め、営業やWebの言葉に展開する段階です。" };
    case "grace":
    case "advisor":
      return { key: "deploy", title: "接点に展開する", body: "完成した提供価値を、営業トーク・価格説明・Webなどの言葉に変換する段階です。" };
    case "locked":
      return { key: "", title: "シートの閲覧", body: "完成した提供価値シートの閲覧とダウンロードができます。" };
    default:
      return { key: "", title: "準備中", body: "ベレネッツからの案内をお待ちください。" };
  }
}

export default async function Home() {
  const { company, supabase } = await requireCustomer();
  const [{ data: progress }, { count: openHomework }] = await Promise.all([
    supabase.from("v_divergence_progress").select("row_count").eq("company_id", company.id).maybeSingle(),
    supabase.from("homeworks").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("status", "open"),
  ]);
  const rows = progress?.row_count ?? 0;
  const step = currentStep(company.status, rows);
  const stage = STAGES.find((s) => s.key === step.key);

  return (
    <div>
      <h1 className="serif text-[30px] leading-tight">{company.name}様、{greeting()}。</h1>

      <section className="mt-12">
        <p className="text-[13px] text-ink-3">いま進めること</p>
        <h2 className="serif text-[22px] mt-1">{step.title}</h2>
        <p className="text-ink-2 mt-2 max-w-[56ch] leading-relaxed">{step.body}</p>
        {stage && (
          <Link href={stage.href} className="btn-primary inline-block mt-6">
            {step.title}へ
          </Link>
        )}
      </section>

      {(openHomework ?? 0) > 0 && (
        <section className="mt-12">
          <p className="text-[13px] text-ink-3">宿題</p>
          <p className="mt-1">
            未回答の宿題が <span className="num">{openHomework}</span> 件あります。{" "}
            <Link href="/homework" className="underline underline-offset-4">宿題を見る</Link>
          </p>
        </section>
      )}
    </div>
  );
}
