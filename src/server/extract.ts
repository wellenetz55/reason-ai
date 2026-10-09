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
  const priv = (ip: string, fam: number) => {
    if (fam === 6) {
      const x = ip.toLowerCase();
      return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:");
    }
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  };
  return addrs.length > 0 && addrs.every((x) => !priv(x.address, x.family));
}

async function fetchUrlText(url: string) {
  if (!(await isPublicHttpUrl(url))) return "";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; reason-ai/1.0)" } });
    if (!res.ok) return "";
    if (!(await isPublicHttpUrl(res.url || url))) return "";
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_FETCH_BYTES) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FETCH_BYTES) return "";
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("pdf")) return (await pdfText(buf)).text;
    return htmlToText(buf.toString("utf8"));
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

async function pdfText(buf: Buffer): Promise<{ text: string; error?: string }> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return { text: (text ?? "").trim() };
  } catch (e) {
    return { text: "", error: e instanceof Error ? e.message : String(e) };
  }
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
    let text = d.text_content ?? "";
    if (!text) {
      if (d.url) text = await fetchUrlText(d.url);
      else if (d.storage_path && d.mime_type === "application/pdf") {
        const { data: f, error: dlErr } = await admin.storage.from("company-docs").download(d.storage_path);
        if (dlErr) errors.push(`${d.title}: download ${dlErr.message}`);
        if (f) { const r = await pdfText(Buffer.from(await f.arrayBuffer())); text = r.text; if (r.error) errors.push(`${d.title}: ${r.error}`); }
      } else if (d.storage_path && d.mime_type === "text/plain") {
        const { data: f } = await admin.storage.from("company-docs").download(d.storage_path);
        if (f) text = (await f.text()).trim();
      }
      if (text) await admin.from("company_documents").update({ text_content: text.slice(0, 200_000) }).eq("id", d.id);
    }
    if (text) out.push({ title: d.title, kind: d.kind, text: text.slice(0, MAX_PER_DOC) });
    else skipped.push(d.title);
  }
  return { docs: out, skipped, errors };
}
