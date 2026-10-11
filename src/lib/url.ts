/**
 * 入力された文字を、登録してよいWebのURLに直す。だめなら null。
 * 「なし」「未定」のような言葉や、末尾の句読点、メール・FTPなどは受け付けない。
 */
export function normalizeWebUrl(input: string): string | null {
  let u = input.trim().replace(/[、。，．）」』,]+$/u, "");
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) {
    // スキームが無いときは、ホスト名らしい形（例：example.co.jp/path）だけ https:// を付ける
    if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d+)?([/?#]|$)/.test(u)) return null;
    u = "https://" + u;
  }
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol) || x.username || x.password || !x.hostname.includes(".")) return null;
    return x.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}
