/**
 * 「どの会社でも言える語」の辞書（一般的な日本語の形容。メソッド資産ではない）。
 * 当たった語に印をつけるだけで、消すかどうかは顧客が決める。
 */
export const VAGUE_WORDS = [
  "高品質", "高い品質", "品質が高い", "安心", "安全", "信頼", "丁寧", "親身", "寄り添", "こだわり", "充実", "豊富", "しっかり",
  "きめ細か", "きめ細やか", "柔軟", "迅速", "スピーディ", "最適", "最高", "最良", "一流", "万全", "徹底", "真摯", "誠実",
  "お客様第一", "顧客第一", "満足", "快適", "心地よ", "上質", "本格", "プロフェッショナル", "経験豊富", "実績豊富", "ワンストップ",
  "トータル", "幅広", "さまざま", "様々", "各種", "多彩", "きちんと", "ちゃんと", "いつでも", "何でも", "なんでも",
];

import { PROMISE_ONLY } from "@/lib/because";

export function findVague(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...VAGUE_WORDS, ...PROMISE_ONLY].filter((w) => text.includes(w));
}

/** 数字・固有名詞らしきものが含まれるか（簡易） */
export function hasConcrete(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[0-9０-９]|[A-Za-z]{3,}|％|%|年|回|件|名|社|分|時間|円|km|kg|m²|㎡/.test(text);
}
