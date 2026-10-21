/** ⑤の「穴」：数字・固有名詞が分からないところに残す印。穴が残っている答えは完成扱いにしない */
export const HOLE_RE = /○|〇|【要[^】]*】|＿＿|__/;
export const hasHole = (s: string | null | undefined) => !!s && HOLE_RE.test(s);
