/** 1社あたりの資料上限（2026-10-08 決定）: ファイル20件・合計200MB、URL 20件、テキスト 20件 */
export const LIMITS = { files: 20, totalBytes: 200 * 1024 * 1024, urls: 20, texts: 20 } as const;

/** 入力欄の文字数上限（サーバ側で切る）。AIに送る文が膨らみすぎないように */
export const MAX = {
  value: 500,      // 提供価値・体験価値・なぜなら・ブレーキの言葉
  target: 200,     // 誰に
  title: 200,      // 資料の題名・競合名・商品名
  profile: 2000,   // 御社の説明の1項目
  answer: 3000,    // 宿題の答え
  pasted: 50000,   // 貼り付けテキスト（議事録など）。AIへ送るときはさらに切る
} as const;
/** 改行をLFにそろえる。ブラウザのフォーム送信は改行をCRLFにするため、保存前と、保存済みの文と比べる前に通す */
export const nl = (s: string | null | undefined) => (s ?? "").replace(/\r\n?/g, "\n");

/** 入力を上限の長さで切る（改行もLFにそろえて保存する） */
export const cut = (s: string, n: number) => nl(s).slice(0, n);

/** AIへ送る1項目を切る（DBに長い文が直接書かれていても、指示文が膨らみすぎないように） */
export const q = (s: string | null | undefined, n: number = 500) => (s ?? "").slice(0, n);


/**
 * 自社の資料ファイルの保管場所として正しい形か（<会社ID>/<uuid>.<拡張子>、または以前の形 <会社ID>/<uuid>-<名前>）。
 * 「..」などで他社のフォルダや別の保管場所に届く文字は通さない（先頭が会社IDで始まるかだけでは足りない）
 */
export function isOwnDocPath(companyId: string, path: string | null | undefined): boolean {
  if (!path) return false;
  const re = new RegExp(`^${companyId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\\.[a-z0-9]{1,5}|-[A-Za-z0-9_][A-Za-z0-9_.-]{0,120})$`);
  return re.test(path) && !path.includes("..");
}
