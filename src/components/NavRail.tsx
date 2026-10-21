"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { MEETING_AFTER_STEP, fmtMeeting } from "@/lib/meetings";

type S = { key: string; step: string; label: string; href: string; open: boolean; now: boolean; ready?: boolean };
export type MeetingMark = { at: string | null; held: boolean; candidates?: number };

/** 面談の行（AIの壁打ちステップの間に挟む）。済／予定／未定 */
function MeetingRow({ label, m }: { label: string; m?: MeetingMark }) {
  const held = !!m?.held;
  return (
    <div className={clsx("flex items-center gap-2 py-[5px] pl-3 -ml-3 text-[11px]", held ? "text-ink-3" : m?.at ? "text-warm" : "text-ink-3")}>
      <span className={clsx("inline-flex items-center justify-center shrink-0 w-[60px] rounded-full py-[2px] text-[9px] font-semibold tracking-[0.08em] leading-none", held ? "bg-paper-2 text-ink-3" : m?.at ? "bg-warm-soft text-warm border border-warm/50" : "border border-dashed border-ink-3 text-ink-3")}>面談</span>
      <span className="leading-tight">{label}<span className="num ml-1.5">{held ? "済" : m?.candidates ? `候補${m.candidates}件・選ぶ` : m?.at ? fmtMeeting(m.at) : "日程は追って"}</span></span>
    </div>
  );
}

/**
 * 左の進捗レール。
 * バッジ: 開いているページ＝紺地に白抜き／開ける段階＝紺の枠線／未到達＝点線グレー。
 * プログラム上「いま進める段階」は、段階名の右に小さなオレンジの点（ホバーで説明）。
 * 「開いているページ」と「いまの段階」を混ぜない。
 */
export function NavRail({ stages, meetings = {} }: { stages: S[]; meetings?: Record<string, MeetingMark> }) {
  const path = usePathname();
  return (
    <nav className="mt-6">
      <ol className="space-y-0">
        {stages.map((s) => {
          const active = path.startsWith(s.href);
          const badge = (
            <span
              className={clsx(
                "num inline-block shrink-0 w-[60px] text-center rounded-full py-[3px] text-[9px] font-semibold tracking-[0.1em] leading-none border",
                active ? "bg-navy border-navy text-on-accent" : s.open ? "border-navy text-navy" : "border-dashed border-ink-3 text-ink-3"
              )}
            >
              {s.step}
            </span>
          );
          const inner = (
            <>
              {badge}
              <span className="text-[14px] leading-tight flex items-center gap-1.5">
                {s.label}
                {s.now && <span className="now-dot ml-1" title="いま進める段階" aria-label="いま進める段階" />}
              </span>
            </>
          );
          const base = "flex items-center gap-2.5 py-[7px] pl-3 -ml-3 border-l-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-navy rounded-sm";
          const after = MEETING_AFTER_STEP[s.key];
          return (
            <li key={s.key}>
              {s.key === "step0" && <MeetingRow label="キックオフ（3時間）" m={meetings.kickoff} />}
              <div>
              {s.open && s.ready !== false ? (
                <Link href={s.href} className={clsx(base, active ? "border-navy text-ink" : "border-transparent text-ink-2 hover:text-ink")}>
                  {inner}
                </Link>
              ) : (
                <span className={clsx(base, "border-transparent text-ink-3")} title={s.open ? "この段階の画面は準備中です。できあがりしだいご案内します" : "面談のあと、ベレネッツが開きます"}>
                  {inner}
                  {s.open && <span className="ml-auto text-[10px] text-ink-3 border hairline rounded-full px-1.5 py-[1px] shrink-0">準備中</span>}
                </span>
              )}
              </div>
              {after && <MeetingRow label={after.label} m={meetings[after.kind]} />}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11px] text-ink-3 flex items-center gap-2"><span className="now-dot" />いま進める段階</p>
      <p className="mt-1 text-[11px] text-ink-3">STEP＝AIとの壁打ち／面談＝ベレネッツと直接</p>
    </nav>
  );
}
