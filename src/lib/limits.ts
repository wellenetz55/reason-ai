/** 1社あたりの資料上限（2026-10-08 決定）: ファイル20件・合計200MB、URL 20件、テキスト 20件 */
export const LIMITS = { files: 20, totalBytes: 200 * 1024 * 1024, urls: 20, texts: 20 } as const;
