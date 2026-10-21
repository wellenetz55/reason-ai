/**
 * ⑤の「穴」：数字・固有名詞が分からないところに残す印。穴が残っている答えは完成扱いにしない。
 * 穴の印は「○」（白丸）と「【要…】」だけ。漢数字の「〇」（創業五〇年など）は本文なので穴にしない。
 */
export const HOLE_SPLIT = /(○|【要[^】]*】)/;
export const HOLE_RE = /○|【要[^】]*】/;
export const hasHole = (s: string | null | undefined) => !!s && HOLE_RE.test(s);
