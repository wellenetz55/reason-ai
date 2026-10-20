import "server-only";

export const MAX_TRANSCRIPT = 400_000;

/** フォームの書き起こし（ファイル or 貼り付け）を読む。無ければ null。読めなければ error */
export async function readTranscript(formData: FormData): Promise<{ text: string; name: string } | { error: string } | null> {
  let text = String(formData.get("transcript_text") || "").trim();
  let name = text ? "貼り付け" : "";
  const f = formData.get("transcript_file");
  if (f instanceof File && f.size > 0) {
    if (f.size > 4 * 1024 * 1024) return { error: "書き起こしのファイルが大きすぎます（4MBまで）。テキスト（.txt）で書き出すと小さくなります" };
    const buf = Buffer.from(await f.arrayBuffer());
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      const { pdfText } = await import("@/server/extract");
      const r = await pdfText(buf);
      if (!r.text) return { error: "PDFから文字を取り出せませんでした" + (r.error ? "：" + r.error : "") };
      text = r.text;
    } else {
      text = buf.toString("utf8").replace(/^\uFEFF/, "");
      // 文字化けしている（Shift_JIS で書き出されたファイル）なら Shift_JIS で読み直す
      if (text.includes("\uFFFD")) {
        try { text = new TextDecoder("shift_jis").decode(buf); } catch { /* そのまま */ }
      }
      text = text.trim();
    }
    name = f.name;
  }
  if (!text) return null;
  return { text, name };
}

