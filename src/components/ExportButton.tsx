import { STAGES } from "@/lib/stages";

/** 各ステップ画面の「ここまでをExcelで出す」。印刷して回覧する用途 */
export function ExportButton({ stageKey }: { stageKey: string }) {
  const s = STAGES.find((x) => x.key === stageKey);
  if (!s) return null;
  return (
    <a href={`/api/export?step=${stageKey}`} className="btn-text inline-flex items-center gap-1.5 -ml-1.5" title={`${s.step} までのデータをExcelでダウンロード（印刷・回覧用）`}>
      <span aria-hidden>↓</span> ここまでをExcelで出す
    </a>
  );
}
