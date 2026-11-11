/**
 * 担当者の名前から、末尾の敬称（様・さま・さん・殿）を外す。
 * アプリがメールでは「様」、画面では「さん」を自分で付けるため、入れると「山田様 様」と二重になる
 */
export function stripHonorific(name: string): string {
  return name.trim().replace(/[\s　]*(様|さま|さん|殿)$/u, "").trim();
}
