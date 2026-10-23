/**
 * AIに「別の案」を頼んだときに残す、前の案の履歴。
 * 古いデータは本文だけの文字列。新しいデータは、戻したときに一緒に戻す項目も入れる。
 */

/** STEP 4：⑤先回りの答え＋⑥なぜなら＋印＋書いた人（ai/customer）。brakes.counter_history(text[]) に JSON 文字列で入れる */
export type CounterEntry = { c: string; b: string | null; t: string | null; a?: string | null };
export function decodeCounter(s: string): CounterEntry {
  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s) as Partial<CounterEntry>;
      if (typeof o.c === "string") return { c: o.c, b: typeof o.b === "string" ? o.b : null, t: typeof o.t === "string" ? o.t : null, a: typeof o.a === "string" ? o.a : null };
    } catch {}
  }
  return { c: s, b: null, t: null, a: null };
}
export const encodeCounter = (e: CounterEntry) => JSON.stringify({ c: e.c, b: e.b, t: e.t, a: e.a ?? null });

/** STEP 2：言い直し案（提供価値＋体験価値）。row_diagnoses.redraft_history(jsonb) にオブジェクトで入れる */
export type VagueEntry = { v: string; e: string | null };
export function decodeVague(x: unknown): VagueEntry | null {
  if (typeof x === "string") return x ? { v: x, e: null } : null;
  if (x && typeof x === "object" && typeof (x as VagueEntry).v === "string") return { v: (x as VagueEntry).v, e: typeof (x as VagueEntry).e === "string" ? (x as VagueEntry).e : null };
  return null;
}
