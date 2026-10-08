import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const FAIL = (origin: string, detail?: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("リンクが無効か、期限切れです。もう一度メールアドレスを入力してください。" + (detail ? `（${detail}）` : ""))}`);

/**
 * GET: code（PKCE）ならその場で交換。token_hash なら「サインインする」ボタンの画面を返す。
 *   メールソフトやセキュリティ製品がリンクを自動で開いてトークンを消費してしまうのを防ぐため、
 *   実際の検証は人がボタンを押した POST で行う。
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") ?? "magiclink";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? FAIL(origin, error.message) : NextResponse.redirect(`${origin}/`);
  }
  if (!tokenHash) return FAIL(origin);
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>選ばれる理由AI</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:"Noto Sans JP",system-ui,sans-serif;color:#1c1c1e;background:#fff}.box{max-width:24rem;padding:0 1.5rem}h1{font-size:18px;font-weight:700;margin:0 0 .75rem}p{font-size:14px;color:#5f5f66;line-height:1.7;margin:0 0 1.5rem}button{background:#1e2a5a;color:#fff;border:0;border-radius:999px;font:inherit;font-size:15px;padding:12px 28px;cursor:pointer}button:hover{filter:brightness(1.08)}</style></head>
<body><div class="box"><h1>選ばれる理由AI にサインインします</h1><p>下のボタンを押すとサインインが完了します。このリンクは一度だけ使えます。</p>
<form method="post" action="/auth/callback"><input type="hidden" name="token_hash" value="${esc(tokenHash)}"><input type="hidden" name="type" value="${esc(type)}"><button type="submit">サインインする</button></form></div></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") || "");
  const type = String(form.get("type") || "magiclink");
  if (!tokenHash) return FAIL(origin);
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "magiclink" });
  return error ? FAIL(origin, error.message) : NextResponse.redirect(`${origin}/`, { status: 303 });
}
