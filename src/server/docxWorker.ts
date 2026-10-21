import "server-only";
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import path from "node:path";

/** Word の本文取り出しに使う時間の上限（ふつうの文書は1秒前後。大きめの文書でも収まるよう少し余裕をとる） */
const DOCX_TIMEOUT_MS = 3000;

// 別スレッドで動かすコード。mammoth の場所は親から受け取る（バンドルに左右されないよう node_modules から読む）
const WORKER_SRC = `
const { parentPort, workerData } = require("node:worker_threads");
const mammoth = require(workerData.mammothPath);
mammoth.extractRawText({ buffer: Buffer.from(workerData.buf) })
  .then((r) => parentPort.postMessage({ text: r.value }))
  .catch((e) => parentPort.postMessage({ error: String((e && e.message) || e) }));
`;

/**
 * Word(.docx) から本文を取り出す。サーバ本体ではなく別スレッド（作業係）で動かし、DOCX_TIMEOUT_MS を過ぎたら打ち切る。
 * 重い文書が来ても、サーバ本体は止まらず・落ちず、その1件の本文が取り出せないだけで済む。
 * 別スレッド自体が使えない環境では、これまでどおりサーバ本体で取り出す（事前の安全確認は済んでいる）。
 */
export async function extractDocxText(buf: Buffer): Promise<{ text: string } | { error: "timeout" | "failed"; detail?: string }> {
  let mammothPath: string;
  try {
    mammothPath = createRequire(path.join(process.cwd(), "package.json")).resolve("mammoth");
  } catch {
    return inProcess(buf);
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: { text: string } | { error: "timeout" | "failed"; detail?: string }) => { if (!done) { done = true; resolve(r); } };
    let w: Worker;
    try {
      // 文書のバイト列はコピーして渡す（作業係が止められても元のデータに影響しない）
      w = new Worker(WORKER_SRC, { eval: true, workerData: { buf: new Uint8Array(buf), mammothPath }, resourceLimits: { maxOldGenerationSizeMb: 512, stackSizeMb: 4 } });
    } catch {
      inProcess(buf).then(finish);
      return;
    }
    const timer = setTimeout(() => { finish({ error: "timeout" }); w.terminate().catch(() => {}); }, DOCX_TIMEOUT_MS);
    w.once("message", (m: { text?: string; error?: string }) => {
      clearTimeout(timer);
      finish(typeof m.text === "string" ? { text: m.text } : { error: "failed", detail: m.error });
      w.terminate().catch(() => {});
    });
    // 作業係のメモリ上限超え・異常終了など。サーバ本体には影響しない
    w.once("error", (e) => { clearTimeout(timer); finish({ error: "failed", detail: e instanceof Error ? e.message : String(e) }); });
    w.once("exit", (code) => { clearTimeout(timer); finish({ error: "failed", detail: `exit ${code}` }); });
  });
}

async function inProcess(buf: Buffer): Promise<{ text: string } | { error: "failed"; detail?: string }> {
  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: value };
  } catch (e) {
    return { error: "failed", detail: e instanceof Error ? e.message : String(e) };
  }
}
