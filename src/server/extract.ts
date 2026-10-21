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
 * Word の XML 部品（本文・スタイル・番号付けなど mammoth が読み込むもの）の要素数の上限。
 * mammoth の負荷はバイト数ではなく要素の数で決まる（細かい要素が詰まった 1MB で約150MB・1秒、8MB で約1.4GB）。
 * 普通の文書は数百ページでも十数万要素までなので、30万要素（mammoth で約400MB・約2秒）で止める。超えたら本文の取り出しだけを見送る（ファイルは保管）。
 */
const MAX_DOCX_XML_ELEMENTS = 300_000;
/**
 * XMLの要素の始まり（「<」の直後が英字・「/」・「?」・「!」）の数を数える。
 * mammoth は部品を名前でなく目次の参照でたどり、先頭に余計な文字があってもXMLとして読むため、
 * 部品の名前や先頭の文字では判断せず、すべての部品で数える。画像などのバイト列から数えられるのは約1/350で、
 * 40MBの画像でも約12万にとどまる。
 */
function countElements(u: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < u.length - 1; i++) {
    if (u[i] !== 0x3c) continue;
    const c = u[i + 1];
    // 英字・「_」・「:」・日本語など（UTF-8 の 0x80 以上）で始まる名前、閉じタグ「/」、宣言「?」「!」
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c >= 0x80 || c === 0x5f || c === 0x3a || c === 0x2f || c === 0x3f || c === 0x21) n++;
  }
  return n;
}


/**
 * Word(.docx) を mammoth に渡す前の安全確認（zip爆弾対策）。
 * mammoth が中で使う jszip そのもの（同じ版）に zip を読ませ、jszip が「中身」として扱う項目それぞれの
 * 圧縮データを、jszip と同じ展開部品（pako・同じ版・同じ設定）で上限つきで実際に展開して数える。
 * 自前で zip を読まない・別の部品で展開しないので、読み方・展開のしかたの食い違いが起きない。
 * jszip は読み込みの時点では展開しない（必要になったときに展開する）ので、この確認自体は安全。
 * 未知の圧縮方式・展開エラー・上限超えは、すべて「読まない」（fail closed）。
 */
const EOCD_SIG = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

async function docxSafeToOpen(buf: Buffer): Promise<{ ok: true } | { ok: false; reason: string }> {
  const bad = (reason: string) => ({ ok: false as const, reason });
  const BIG = "Wordファイルの中身が大きすぎるため、読み取りませんでした";
  // jszip に読ませる前に、jszip と同じ順番で目次をたどり、jszip が読み込みに使う量に上限をかける。
  // （jszip は申告の件数を無視し、署名が続くかぎり目次を読み込む。読み込みの時点でメモリと時間を使うので、ここで止める）
  {
    const FORMAT = "Wordファイルの形式を確かめられませんでした";
    const eocd = buf.lastIndexOf(EOCD_SIG); // jszip と同じく、最後に現れた終端（EOCD）を使う
    if (eocd < 0 || eocd + 22 > buf.length) return bad(FORMAT);
    const cdSize = buf.readUInt32LE(eocd + 12), cdOffset = buf.readUInt32LE(eocd + 16);
    // ZIP64 の印がある zip は扱わない（Word ファイルは使わない）
    if (buf.readUInt16LE(eocd + 4) === 0xffff || buf.readUInt16LE(eocd + 6) === 0xffff || buf.readUInt16LE(eocd + 8) === 0xffff
      || buf.readUInt16LE(eocd + 10) === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return bad(FORMAT);
    const extraBytes = eocd - (cdOffset + cdSize);
    if (extraBytes < 0) return bad(FORMAT);
    const zero = extraBytes; // jszip は先頭に余分なデータがあると、そのぶん読み始めの位置をずらす（reader.zero）
    let p = zero + cdOffset;
    let n = 0, extraSum = 0;
    while (p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50) {
      if (++n > 2000) return bad(FORMAT);
      const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
      const local = buf.readUInt32LE(p + 42);
      if (local === 0xffffffff) return bad(FORMAT);
      // 目次の補助情報（extra field）の合計：jszip は1つずつ読み込むので、極端に多いと読み込みにメモリを使う
      extraSum += extraLen;
      if (extraSum > 256 * 1024) return bad(FORMAT);
      // jszip が実際に読む各部品の先頭（ローカルヘッダ）の名前の長さ：長い名前を何度も読ませる細工を止める
      const lp = zero + local;
      if (lp + 30 > buf.length) return bad(FORMAT);
      if (buf.readUInt16LE(lp + 26) > 1024) return bad(FORMAT);
      p += 46 + nameLen + extraLen + commentLen;
    }
    if (n === 0) return bad(FORMAT);
  }
  const JSZip = (await import("jszip")).default;
  const pakoMod = (await import("pako")) as unknown as { Inflate?: typeof import("pako").Inflate; default?: { Inflate: typeof import("pako").Inflate } };
  const PakoInflate = pakoMod.Inflate ?? pakoMod.default!.Inflate;
  let zip: InstanceType<typeof JSZip>;
  try { zip = await JSZip.loadAsync(buf); } catch { return bad("Wordファイルの形式を確かめられませんでした"); }
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > 2000) return bad("Wordファイルの形式を確かめられませんでした");
  // 展開する前に、各部品の圧縮データの長さを合計する。重ならない部品の合計はファイル自体より大きくなり得ない。
  // ファイルより大きければ、同じ圧縮データを何度も指させている（何千回も展開させてCPUを使わせる細工）ので読まない
  {
    let compressed = 0;
    for (const f of entries) {
      const c = (f as unknown as { _data?: { compressedContent?: unknown } })._data?.compressedContent;
      if (c instanceof Uint8Array) compressed += c.length;
    }
    if (compressed > buf.length) return bad("Wordファイルの形式を確かめられませんでした");
  }
  let total = 0;
  let elements = 0;
  const TOO_COMPLEX = "Wordファイルの構造が細かすぎるため、本文を読み取りませんでした";
  for (const f of entries) {
    // jszip の内部（3.x の CompressedObject）：compression.magic と compressedContent（この範囲を mammoth も展開する）
    let raw = (f as unknown as { _data?: unknown })._data;
    // 中身が0バイトの部品は、jszip が「空の値（を返す Promise）」にしておき展開しない
    if (raw && typeof (raw as { then?: unknown }).then === "function") {
      const v = await (raw as Promise<unknown>);
      if (v === "" || (v instanceof Uint8Array && v.length === 0)) continue;
      return bad("Wordファイルの形式を確かめられませんでした");
    }
    if (raw === "") continue;
    raw = raw as unknown;
    const data = raw as { compression?: { magic?: string }; compressedContent?: unknown } | undefined;
    const magic = data?.compression?.magic;
    const content = data?.compressedContent;
    if (!(content instanceof Uint8Array)) return bad("Wordファイルの形式を確かめられませんでした");
    if (magic === "\x00\x00") { // 無圧縮
      total += content.length;
      if (total > MAX_DOCX_UNZIPPED) return bad(BIG);
      if ((elements += countElements(content)) > MAX_DOCX_XML_ELEMENTS) return bad(TOO_COMPLEX);
      continue;
    }
    if (magic !== "\x08\x00") return bad("対応していない圧縮方式のWordファイルです");
    // jszip（lib/flate.js）と同じ：raw で、データを少しずつ push(…, false)、最後に push([], true)
    let over = false;
    let complex = false;
    const inf = new PakoInflate({ raw: true });
    inf.onData = (chunk) => {
      total += chunk.length;
      if (total > MAX_DOCX_UNZIPPED) over = true;
      if ((elements += countElements(chunk)) > MAX_DOCX_XML_ELEMENTS) complex = true;
    };
    try {
      for (let i = 0; i < content.length && !over && !complex; i += 4096) inf.push(content.subarray(i, Math.min(i + 4096, content.length)), false);
      if (!over && !complex) inf.push([], true);
    } catch { return bad("Wordファイルを展開できませんでした"); }
    if (over) return bad(BIG);
    if (complex) return bad(TOO_COMPLEX);
    if (inf.err) return bad("Wordファイルを展開できませんでした");
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
      // 本文の取り出しは別スレッドで、時間を区切って行う（重い文書でもサーバ本体は止まらない）
      const { extractDocxText } = await import("@/server/docxWorker");
      const r = await extractDocxText(buf);
      if ("error" in r) {
        return { text: null, error: r.error === "timeout"
          ? "Wordファイルの読み取りに時間がかかりすぎたため、本文を取り出せませんでした（ファイルは保管しました。PDFにして上げ直すと読めることがあります）"
          : "Wordファイルを読めませんでした（ファイルは保管しました）" };
      }
      return { text: r.text.trim() || null };
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
