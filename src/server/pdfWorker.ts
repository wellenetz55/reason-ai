import "server-only";
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import path from "node:path";

/** PDFの本文取り出しに使う時間の上限。ふつうの会社案内は数秒。重いPDFで資料の下書き全体（300秒）を止めないよう区切る */
const PDF_TIMEOUT_MS = 45_000;

// 別スレッドで動かすコード。unpdf の場所は親から受け取る（バンドルに左右されないよう node_modules から読む）
const WORKER_SRC = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  const { extractText, getDocumentProxy } = require(workerData.unpdfPath);
  const pdf = await getDocumentProxy(new Uint8Array(workerData.buf));
  if (pdf.numPages <= workerData.maxPages) {
    const { text } = await extractText(pdf, { mergePages: true });
    parentPort.postMessage({ text: String(text || "").trim() });
    return;
  }
  const parts = [];
  for (let i = 1; i <= workerData.maxPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    parts.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  parentPort.postMessage({ text: parts.join("\\n").trim(), pages: pdf.numPages });
})().catch((e) => parentPort.postMessage({ error: String((e && e.message) || e) }));
`;

export type PdfResult = { text: string; pages?: number } | { error: "timeout" | "failed" | "unavailable"; detail?: string };

/**
 * PDFから本文を取り出す。サーバ本体ではなく別スレッド（作業係）で動かし、時間とメモリに上限を設ける。
 * 中身を展開すると巨大になるPDFや、ページが極端に重いPDFが来ても、サーバ本体は止まらず・落ちず、その1件が読めないだけで済む。
 * 別スレッドが使えない環境では "unavailable" を返す（呼び出し側がこれまでどおりの読み方に切り替える）。
 */
export async function extractPdfText(buf: Buffer, maxPages: number): Promise<PdfResult> {
  let unpdfPath: string;
  try {
    unpdfPath = createRequire(path.join(process.cwd(), "package.json")).resolve("unpdf");
  } catch {
    return { error: "unavailable" };
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: PdfResult) => { if (!done) { done = true; resolve(r); } };
    let w: Worker;
    try {
      w = new Worker(WORKER_SRC, { eval: true, workerData: { buf: new Uint8Array(buf), unpdfPath, maxPages }, resourceLimits: { maxOldGenerationSizeMb: 768, stackSizeMb: 4 } });
    } catch {
      finish({ error: "unavailable" });
      return;
    }
    const timer = setTimeout(() => { finish({ error: "timeout" }); w.terminate().catch(() => {}); }, PDF_TIMEOUT_MS);
    w.once("message", (m: { text?: string; pages?: number; error?: string }) => {
      clearTimeout(timer);
      finish(typeof m.text === "string" ? { text: m.text, pages: m.pages } : { error: "failed", detail: m.error });
      w.terminate().catch(() => {});
    });
    // 作業係のメモリ上限超え・異常終了など。サーバ本体には影響しない
    w.once("error", (e) => { clearTimeout(timer); finish({ error: "failed", detail: e instanceof Error ? e.message : String(e) }); });
    w.once("exit", (code) => { clearTimeout(timer); finish({ error: "failed", detail: `exit ${code}` }); });
  });
}
