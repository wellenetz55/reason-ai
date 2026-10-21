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
export const cut = (s: string, n: number) => s.slice(0, n);

/** AIへ送る1項目を切る（DBに長い文が直接書かれていても、指示文が膨らみすぎないように） */
export const q = (s: string | null | undefined, n: number = 500) => (s ?? "").slice(0, n);
