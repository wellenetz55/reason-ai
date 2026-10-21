import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_PER_DOC = 30_000;

/** HTML → テキスト（雑でよい。見出しと本文が残れば足りる） */
function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

const MAX_FETCH_BYTES = 8 * 1024 * 1024;

/** 社内向け・予約済みのアドレスか */
function priv(ip: string, fam: number) {
    if (fam === 6) {
      const x = ip.toLowerCase();
      // ::1／未指定／ULA(fc00::/7)／リンクローカル(fe80::/10)／IPv4射影／NAT64(64:ff9b::/96)／マルチキャスト(ff00::/8)
      return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || /^fe[89ab]/.test(x) || x.startsWith("::ffff:") || x.startsWith("64:ff9b:") || x.startsWith("ff");
    }
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
      || (a === 198 && (b === 18 || b === 19)) // ベンチマーク用 198.18.0.0/15
      || (a === 192 && b === 0)                // 192.0.0.0/24・192.0.2.0/24
      || a >= 224;                              // マルチキャスト・予約（224.0.0.0 以上）
  }

/** 社内ネットワーク・メタデータ等に向くURLを拒否する（SSRF対策） */
async function isPublicHttpUrl(url: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  const { lookup } = await import("node:dns/promises");
  let addrs: { address: string; family: number }[];
  try { addrs = await lookup(host, { all: true }); } catch { return false; }
  return addrs.length > 0 && addrs.every((x) => !priv(x.address, x.family));
}


/**
 * 確かめたアドレスにだけ接続する GET（DNS rebinding 対策）。
 * 接続の直前の名前解決でも社内向けアドレスなら接続しない。fetch と同じ Response を返す。
 */
type Pinned = { status: number; headers: import("node:http").IncomingHttpHeaders; res: import("node:http").IncomingMessage };

async function pinnedGet(url: string, signal: AbortSignal): Promise<Pinned> {
  const u = new URL(url);
  const mod = u.protocol === "https:" ? await import("node:https") : await import("node:http");
  const dns = await import("node:dns");
  const lookup = ((host: string, opts: unknown, cb: (err: Error | null, address?: unknown, family?: number) => void) => {
    const o = (typeof opts === "object" && opts ? opts : {}) as { all?: boolean };
    dns.lookup(host, { all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = addrs as { address: string; family: number }[];
      if (!list.length || list.some((a) => priv(a.address, a.family))) return cb(new Error("blocked address"));
      return o.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
    });
  }) as unknown as typeof dns.lookup;
  return new Promise<Pinned>((resolve, reject) => {
    // 本文は自動では読み進めない（呼び出し側が読む分だけ受け取る＝相手が無限に送ってきてもメモリを食わない）
    const req = mod.request(u, { method: "GET", lookup, signal, headers: { "user-agent": "Mozilla/5.0 (compatible; reason-ai/1.0)", "accept-encoding": "identity" } }, (res) => {
      res.pause();
      resolve({ status: res.statusCode ?? 0, headers: res.headers, res });
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchUrlText(url: string) {
  if (!(await isPublicHttpUrl(url))) return "";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  const opened: Pinned[] = [];
  try {
    // 転送は自分でたどり、1回ごとに社内向けアドレスでないか確かめる（最大3回）
    let cur = url;
    let res: Pinned | null = null;
    for (let hop = 0; hop <= 3; hop++) {
      if (!(await isPublicHttpUrl(cur))) return "";
      res = await pinnedGet(cur, ctrl.signal);
      opened.push(res);
      const loc = res.headers.location;
      if (res.status >= 300 && res.status < 400 && loc) {
        res.res.destroy(); // 転送元の本文は読まずに閉じる
        cur = new URL(loc, cur).toString();
        res = null;
        continue;
      }
      break;
    }
    if (!res || res.status < 200 || res.status >= 300) return "";
    const len = Number(res.headers["content-length"] ?? 0);
    if (len > MAX_FETCH_BYTES) return "";
    // 少しずつ読んで上限を超えたら打ち切る（全部メモリに載せてから測らない）
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const c of res.res) {
      const b = c as Buffer;
      total += b.length;
      if (total > MAX_FETCH_BYTES) return "";
      chunks.push(b);
    }
    const buf = Buffer.concat(chunks);
    const ct = String(res.headers["content-type"] ?? "");
    if (ct.includes("pdf")) return (await pdfText(buf)).text;
    return htmlToText(buf.toString("utf8"));
  } catch {
    return "";
  } finally {
    clearTimeout(t);
    // どの経路で抜けても、開いた接続はすべて閉じる
    for (const o of opened) o.res.destroy();
    ctrl.abort();
  }
}

const MAX_PDF_PAGES = 200;
const MAX_DOCX_UNZIPPED = 60 * 1024 * 1024;


/**
 * Word(.docx) を mammoth に渡す前の安全確認（zip爆弾対策）。
 * mammoth が使う jszip と同じ読み方をする：末尾の目次（central directory）から各項目の位置と「圧縮後サイズ」を読み、
 * jszip が展開するのとまったく同じバイト列を、上限つきで実際に展開して数える。申告された展開後サイズは使わない。
 * 目次の位置のずれ・ZIP64・未知の圧縮方式・範囲外・展開エラーは、すべて「読まない」（fail closed）。
 */
async function docxSafeToOpen(buf: Buffer): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { Inflate } = await import("fflate");
  const bad = (reason: string) => ({ ok: false as const, reason });
  const FORMAT = "Wordファイルの形式を確かめられませんでした";
  const BIG = "Wordファイルの中身が大きすぎるため、読み取りませんでした";
  const u8 = new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const u16 = (o: number) => dv.getUint16(o, true);
  const u32 = (o: number) => dv.getUint32(o, true);
  // 末尾の目次の終わり（EOCD）を探す（コメント最大 65535 バイト）
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return bad(FORMAT);
  const count = u16(eocd + 10), cdSize = u32(eocd + 12), cdOffset = u32(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return bad(FORMAT); // ZIP64 は扱わない
  if (count === 0 || count > 2000 || cdOffset + cdSize > eocd) return bad(FORMAT);
  if (u32(cdOffset) !== 0x02014b50) return bad(FORMAT); // 目次が申告どおりの位置に無い（前に余分なデータがある等）
  let p = cdOffset;
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || u32(p) !== 0x02014b50) return bad(FORMAT);
    const method = u16(p + 10), comp = u32(p + 20), uncomp = u32(p + 24);
    const nameLen = u16(p + 28), extraLen = u16(p + 30), commentLen = u16(p + 32), local = u32(p + 42);
    if (comp === 0xffffffff || uncomp === 0xffffffff || local === 0xffffffff) return bad(FORMAT);
    p += 46 + nameLen + extraLen + commentLen;
    if (method !== 0 && method !== 8) return bad("対応していない圧縮方式のWordファイルです");
    if (local + 30 > u8.length || u32(local) !== 0x04034b50) return bad(FORMAT);
    const start = local + 30 + u16(local + 26) + u16(local + 28);
    const end = start + comp;
    if (end > cdOffset) return bad(FORMAT);
    if (method === 0) {
      total += comp;
      if (total > MAX_DOCX_UNZIPPED) return bad(BIG);
      continue;
    }
    // 圧縮されている項目：jszip が展開するのと同じ範囲を、少しずつ展開して数える
    let over = false;
    let err = false;
    const inf = new Inflate((chunk) => { total += chunk.length; if (total > MAX_DOCX_UNZIPPED) over = true; });
    try {
      for (let i = start; i < end && !over; i += 4096) inf.push(u8.subarray(i, Math.min(i + 4096, end)), i + 4096 >= end);
      if (comp === 0) inf.push(new Uint8Array(0), true);
    } catch { err = true; }
    if (over) return bad(BIG);
    if (err) return bad("Wordファイルを展開できませんでした");
  }
  return { ok: true };
}

export async function pdfText(buf: Buffer): Promise<{ text: string; error?: string }> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    // 何千ページもあるPDFで処理が止まらないよう、先頭 MAX_PDF_PAGES ページまで読む
    if (pdf.numPages <= MAX_PDF_PAGES) {
      const { text } = await extractText(pdf, { mergePages: true });
      return { text: (text ?? "").trim() };
    }
    const parts: string[] = [];
    for (let i = 1; i <= MAX_PDF_PAGES; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      parts.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
    return { text: parts.join("\n").trim(), error: `先頭${MAX_PDF_PAGES}ページまで読みました（全${pdf.numPages}ページ）` };
  } catch (e) {
    return { text: "", error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 1つのファイルから文字を取り出す（面談メモなど）。テキスト（UTF-8 / Shift_JIS）・PDF・Word（.docx）。
 * 画像などは null（保管のみ）。
 */
export async function fileToText(buf: Buffer, name: string, type: string): Promise<{ text: string | null; error?: string }> {
  const lower = name.toLowerCase();
  if (type === "application/pdf" || lower.endsWith(".pdf")) {
    const r = await pdfText(buf);
    return { text: r.text || null, error: r.text ? undefined : r.error ?? "PDFから文字を取り出せませんでした" };
  }
  if (lower.endsWith(".docx") || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    try {
      // 展開すると巨大になるファイル（zip爆弾）を読まない：中身の展開後サイズを先に確かめる
      // 展開しても安全かを先に確かめる。少しでも怪しければ読まない（fail closed）
      const safe = await docxSafeToOpen(buf);
      if (!safe.ok) return { text: null, error: `${safe.reason}（ファイルは保管しました）` };
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return { text: value.trim() || null };
    } catch (e) {
      return { text: null, error: "Wordファイルを読めませんでした：" + (e instanceof Error ? e.message : String(e)) };
    }
  }
  if (type.startsWith("text/") || /\.(txt|md|vtt|srt|csv|tsv)$/.test(lower)) {
    let text = buf.toString("utf8").replace(/^\uFEFF/, "");
    if (text.includes("\uFFFD")) {
      try { text = new TextDecoder("shift_jis").decode(buf); } catch { /* そのまま */ }
    }
    return { text: text.trim() || null };
  }
  return { text: null };
}

type Doc = { id: string; title: string; kind: string; storage_path: string | null; url: string | null; text_content: string | null; mime_type: string | null };

/**
 * 会社の資料をテキスト化して返す。抽出結果は company_documents.text_content にキャッシュ。
 * 画像は読まない（note に残す）。
 */
export async function extractCompanyDocs(companyId: string): Promise<{ docs: { title: string; kind: string; text: string }[]; skipped: string[]; errors: string[] }> {
  const admin = createAdminClient();
  const { data } = await admin.from("company_documents").select("id, title, kind, storage_path, url, text_content, mime_type").eq("company_id", companyId).order("created_at");
  const out: { title: string; kind: string; text: string }[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  for (const d of (data ?? []) as Doc[]) {
    // 自社のフォルダ以外のファイルは読まない（行の storage_path が書き換えられていても他社の資料に届かないように）
    if (d.storage_path && !d.storage_path.startsWith(`${companyId}/`)) { skipped.push(d.title); continue; }
    let text = d.text_content ?? "";
    if (!text) {
      if (d.url) text = await fetchUrlText(d.url);
      else if (d.storage_path && d.mime_type === "application/pdf") {
        const { data: f, error: dlErr } = await admin.storage.from("company-docs").download(d.storage_path);
        if (dlErr) errors.push(`${d.title}: download ${dlErr.message}`);
        if (f) { const r = await pdfText(Buffer.from(await f.arrayBuffer())); text = r.text; if (r.error) errors.push(`${d.title}: ${r.error}`); }
      } else if (d.storage_path && d.mime_type === "text/plain") {
        const { data: f } = await admin.storage.from("company-docs").download(d.storage_path);
        if (f) {
          const buf = Buffer.from(await f.arrayBuffer());
          text = buf.toString("utf8");
          if (text.includes("\uFFFD")) { try { text = new TextDecoder("shift_jis").decode(buf); } catch { /* そのまま */ } }
          text = text.trim();
        }
      }
      if (text) await admin.from("company_documents").update({ text_content: text.slice(0, 200_000) }).eq("id", d.id);
    }
    if (text) out.push({ title: d.title, kind: d.kind, text: text.slice(0, MAX_PER_DOC) });
    else skipped.push(d.title);
  }
  return { docs: out, skipped, errors };
}
