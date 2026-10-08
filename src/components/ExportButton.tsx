import { FileSpreadsheet } from "lucide-react";
import { STAGES } from "@/lib/stages";

/** 各ステップ画面の「ここまでをExcelでエクスポートする」。印刷して回覧する用途 */
export function ExportButton({ stageKey }: { stageKey: string }) {
  const s = STAGES.find((x) => x.key === stageKey);
  if (!s) return null;
  return (
    <a
      href={`/api/export?step=${stageKey}`}
      className="btn-text inline-flex items-center gap-2 -ml-1.5 group"
      title={`${s.step} までのデータをExcelでダウンロード（印刷・回覧用）`}
    >
      <span className="relative inline-flex items-center justify-center w-7 h-7 rounded-md bg-fact/10 text-fact group-hover:bg-fact/15 transition-colors">
        <FileSpreadsheet size={16} strokeWidth={1.75} aria-hidden />
      </span>
      ここまでをExcelでエクスポートする
    </a>
  );
}
