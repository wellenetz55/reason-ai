"use server";
import { requireStage } from "@/server/stageGuard";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const fail = (msg: string): never => redirect(`/step0?error=${encodeURIComponent(msg)}`);
import { randomUUID } from "node:crypto";
import { requireCustomer, isMember } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { LIMITS, MAX, cut, nl } from "@/lib/limits";
import { normalizeWebUrl } from "@/lib/url";
import { PROFILE_ITEMS } from "@/lib/profileItems";
import { draftProfile } from "@/server/profile";
import { aiGuard } from "@/server/aiGuard";

const KINDS = ["brochure", "sales_deck", "website", "recruit", "exhibition", "testimonial", "presentation", "other"] as const;
const MAX_BYTES = 25 * 1024 * 1024;

async function usage(supabase: Awaited<ReturnType<typeof requireCustomer>>["supabase"], companyId: string) {
  const { data } = await supabase.from("company_documents").select("storage_path, url, text_content, size_bytes").eq("company_id", companyId);
  const docs = data ?? [];
  return {
    files: docs.filter((d) => d.storage_path).length,
    bytes: docs.reduce((a, d) => a + (d.size_bytes ?? 0), 0),
    urls: docs.filter((d) => d.url).length,
    texts: docs.filter((d) => !d.storage_path && !d.url).length,
  };
}
export type Usage = Awaited<ReturnType<typeof usage>>;
export async function getUsage() {
  const { supabase, company } = await requireCustomer();
  return usage(supabase, company.id);
}
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"];

function kindOf(v: FormDataEntryValue | null) {
  const k = String(v ?? "other");
  return (KINDS as readonly string[]).includes(k) ? k : "other";
}

/**
 * 大きなファイルは、サーバを通さずブラウザから保管場所へ直接送る（サーバの受け取り上限 約4.5MB を避けるため）。
 * ① prepareUpload で検査と送り先の発行 → ② ブラウザが送る → ③ finishUpload で記録。
 */
export async function prepareUpload(meta: { name: string; size: number; type: string }): Promise<{ ok: true; path: string; token: string } | { ok: false; error: string }> {
  const { company, supabase } = await requireStage("step0");
  if (!meta?.name || !meta.size) return { ok: false, error: "ファイルを選んでください。" };
  if (meta.size > MAX_BYTES) return { ok: false, error: "ファイルが大きすぎます（25MBまで）。" };
  if (!ALLOWED.includes(meta.type)) return { ok: false, error: "このファイルの形式は登録できません（PDF・画像・テキスト）。" };
  const u = await usage(supabase, company.id);
  // 送り先だけ発行して登録まで済まなかったファイルも保管場所には残るので、実際に置かれているファイルの数・容量でも上限を確かめる
  const store = createAdminClient().storage.from("company-docs");
  const { data: stored } = await store.list(company.id, { limit: 1000 });
  // 登録まで済まずに残ったファイル（1時間以上前に置かれ、どの資料にも結びついていないもの）は片づけてから数える
  const { data: known, error: kErr } = await supabase.from("company_documents").select("storage_path").eq("company_id", company.id).not("storage_path", "is", null);
  const knownSet = new Set((known ?? []).map((k) => k.storage_path));
  const hourAgo = Date.now() - 3600_000;
  // 登録済みの一覧が読めなかったときは片づけない（空の一覧で比べると、登録済みのファイルまで消してしまうため）
  const candidates = kErr || !Array.isArray(known) ? [] : (stored ?? []).filter((o) => o.id && !knownSet.has(`${company.id}/${o.name}`) && new Date(o.created_at ?? Date.now()).getTime() < hourAgo);
  // 念のため：登録済みのファイルがあるのに、置かれているファイルが全部「結びついていない」と出たら、何かがおかしいので片づけない
  const orphans = knownSet.size > 0 && candidates.length === (stored ?? []).filter((o) => o.id).length ? [] : candidates;
  if (orphans.length) await store.remove(orphans.map((o) => `${company.id}/${o.name}`));
  const gone = new Set(orphans.map((o) => o.name));
  const files = (stored ?? []).filter((o) => o.id && !gone.has(o.name));
  const storedBytes = files.reduce((a, o) => a + Number((o.metadata as { size?: number } | null)?.size ?? 0), 0);
  const nFiles = Math.max(u.files, files.length), nBytes = Math.max(u.bytes, storedBytes);
  if (nFiles >= LIMITS.files || nBytes + meta.size > LIMITS.totalBytes) return { ok: false, error: "登録できるファイルの数か容量の上限に達しています。不要な資料を取り下げてください。" };
  // 保管場所のキーは英数字だけにする（日本語のキーを受け付けない環境があるため）。元の名前は記録の題名に残す
  const ext = (meta.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? "bin").toLowerCase();
  const path = `${company.id}/${randomUUID()}.${ext}`;
  const { data, error } = await createAdminClient().storage.from("company-docs").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "送り先を用意できませんでした。しばらくしてからもう一度お試しください。" };
  return { ok: true, path: data.path ?? path, token: data.token };
}

export async function finishUpload(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { company, user, supabase } = await requireStage("step0");
  const path = String(formData.get("path") || "");
  // prepareUpload が発行した形（自社フォルダ直下の uuid.拡張子）だけを受け付ける
  const re = new RegExp(`^${company.id}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[a-z0-9]{1,5}$`);
  if (!re.test(path)) return { ok: false, error: "登録できませんでした。" };
  const { data: dup } = await supabase.from("company_documents").select("id").eq("company_id", company.id).eq("storage_path", path).maybeSingle();
  if (dup) return { ok: true };
  // 本当に保管場所に届いたかを確かめ、実際の大きさ・形式を使う
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: objs } = await createAdminClient().storage.from("company-docs").list(dir, { search: name, limit: 5 });
  const obj = (objs ?? []).find((o) => o.name === name);
  if (!obj) return { ok: false, error: "ファイルが届いていません。もう一度お試しください。" };
  const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
  // 上限を、実際に届いた大きさでもう一度確かめる（超えていたら届いたファイルを消す）
  const u = await usage(supabase, company.id);
  if (u.files >= LIMITS.files || u.bytes + (meta.size ?? 0) > LIMITS.totalBytes) {
    await createAdminClient().storage.from("company-docs").remove([path]);
    return { ok: false, error: "登録できるファイルの数か容量の上限に達しています。不要な資料を取り下げてください。" };
  }
  const fileName = String(formData.get("file_name") || name).slice(0, 200);
  const { error: insErr } = await supabase.from("company_documents").insert({
    company_id: company.id,
    kind: kindOf(formData.get("kind")),
    title: cut(String(formData.get("title") || fileName).trim() || fileName, MAX.title),
    storage_path: path,
    mime_type: meta.mimetype ?? String(formData.get("file_type") || ""),
    size_bytes: meta.size ?? Number(formData.get("file_size") || 0),
    uploaded_by: user.id,
  });
  if (insErr) {
    await createAdminClient().storage.from("company-docs").remove([path]);
    return { ok: false, error: "登録できませんでした。もう一度お試しください。" };
  }
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "doc.upload" });
  revalidatePath("/step0");
  return { ok: true };
}

/** URL を登録（Webサイト・採用ページ・レビューなど） */
export async function addUrl(formData: FormData) {
  const { company, user, supabase } = await requireStage("step0");
  const raw = String(formData.get("url") || "").trim();
  if (!raw) return;
  const url = normalizeWebUrl(raw);
  if (!url) fail("URLの形式が正しくありません（例：https://www.example.co.jp）。");
  if ((await usage(supabase, company.id)).urls >= LIMITS.urls) fail("登録できるURLの数の上限に達しています。");
  await supabase.from("company_documents").insert({
    company_id: company.id,
    kind: kindOf(formData.get("kind")),
    title: cut(String(formData.get("title") || url).trim() || url!, MAX.title),
    url,
    uploaded_by: user.id,
  });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "doc.url" });
  revalidatePath("/step0");
}

/** テキストを貼り付けて登録（議事録・営業トーク・メモなど） */
export async function addText(formData: FormData) {
  const { company, user, supabase } = await requireStage("step0");
  const text = cut(String(formData.get("text") || "").trim(), MAX.pasted);
  if (!text) return;
  if ((await usage(supabase, company.id)).texts >= LIMITS.texts) fail("登録できるテキストの数の上限に達しています。");
  await supabase.from("company_documents").insert({
    company_id: company.id,
    kind: kindOf(formData.get("kind")),
    title: cut(String(formData.get("title") || text.slice(0, 30)).trim() || "テキスト", MAX.title),
    text_content: text.slice(0, 200_000),
    uploaded_by: user.id,
  });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "doc.text" });
  revalidatePath("/step0");
}

/** 資料を取り下げる（ファイルも削除） */
export async function removeDocument(formData: FormData) {
  const { company, supabase } = await requireStage("step0");
  const id = String(formData.get("id"));
  const { data: doc } = await supabase.from("company_documents").select("id, storage_path").eq("id", id).eq("company_id", company.id).maybeSingle();
  if (!doc) return;
  // 最後の1件を取り下げると STEP 0 が空になり、STEP 1 以降が開けなくなる。御社の説明を1項目も承認していなければ止める
  const [{ count: docs }, { count: items }] = await Promise.all([
    supabase.from("company_documents").select("id", { count: "exact", head: true }).eq("company_id", company.id),
    supabase.from("profile_items").select("key", { count: "exact", head: true }).eq("company_id", company.id).in("status", ["approved", "fixed"]),
  ]);
  if (company.status !== "onboarding" && (docs ?? 0) <= 1 && (items ?? 0) === 0) fail("これが最後の資料です。取り下げると STEP 1 以降が開けなくなるので、先に差し替える資料を登録するか、御社の説明を1項目以上承認してから取り下げてください。");
  if (doc.storage_path?.startsWith(`${company.id}/`)) await createAdminClient().storage.from("company-docs").remove([doc.storage_path]);
  await supabase.from("company_documents").delete().eq("id", doc.id);
  revalidatePath("/step0");
}

// ---------- 御社の説明（profile_items） ----------

/** 「戻す」で下書きに戻した、御社が書いた（承認した）文の印。AIの作り直しの対象にしない */
const OWN_SOURCE = "御社が書いた文";
/** 承認したAIの文を「戻す」で下書きに戻したときの印（元の出所はこのあとに続ける） */
const APPROVED_MARK = "承認した文";
const isKept = (src: string | null | undefined) => src === OWN_SOURCE || String(src ?? "").startsWith(APPROVED_MARK);

/** 資料から AI が下書きを作る。承認済み・直した・保留の項目は上書きしない */
export async function requestProfileDraft() {
  const { supabase, company, user } = await requireStage("step0");
  const res = await aiGuard(supabase, company.id, user.id, "profile.draft", () => draftProfile(company.id, company.name));
  if (!res) { revalidatePath("/step0"); return; }
  const { items, skipped, errors } = res;
  const { data: existing } = await supabase.from("profile_items").select("key, status, source").eq("company_id", company.id);
  // 承認・直した・保留の項目に加え、「戻す」で下書きに戻した御社の文も上書きしない
  const locked = new Set((existing ?? []).filter((e) => ["approved", "fixed", "held"].includes(e.status) || isKept(e.source)).map((e) => e.key));
  const rows = items.filter((i) => !locked.has(i.key)).map((i) => ({
    company_id: company.id, key: i.key, draft: i.draft || null, tag: i.tag || "hypothesis", source: i.source || null,
    status: i.draft ? "draft" : "empty", updated_at: new Date().toISOString(),
  }));
  if (rows.length) await supabase.from("profile_items").upsert(rows, { onConflict: "company_id,key" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "profile.draft", payload: { n: rows.length, skipped, errors } });
  revalidatePath("/step0");
}

/** 項目ごとの 直す／承認／保留、B の回答 */
export async function reviewProfileItem(formData: FormData) {
  const { supabase, company, user, profile } = await requireStage("step0");
  const key = String(formData.get("key"));
  const action = String(formData.get("action")); // approve | fix | hold | answer | reopen
  const after = cut(String(formData.get("after") || "").trim(), MAX.profile);
  // 決まった項目だけ受け付ける。「一言で言うと」など固定の項目はここでは変えない
  const def = PROFILE_ITEMS.find((d) => d.key === key);
  if (!def || def.fixed) return;
  const { data: cur } = await supabase.from("profile_items").select("*").eq("company_id", company.id).eq("key", key).maybeSingle();
  const patch: Record<string, unknown> = { company_id: company.id, key, updated_at: new Date().toISOString() };
  // メンバーは承認・保留・戻すができない。直した文・答えは担当者の承認待ちとして残す。
  // 承認・修正済みの項目なら、確定した文（value）と状態はそのままにして、修正案を draft に置く（STEP 0 が空になって先が閉じることも、確定した文が消えることもない）
  if (isMember(profile)) {
    if (action !== "fix" && action !== "answer") { revalidatePath("/step0"); return; }
    if (!after) return;
    const settled = ["approved", "fixed"].includes(cur?.status ?? "") || !!cur?.value; // 保留中でも確定した文があれば消さない
    await supabase.from("profile_items").upsert(settled
      ? { ...(cur ?? {}), ...patch, draft: after }
      : { ...(cur ?? {}), ...patch, draft: after, value: null, status: "draft", source: OWN_SOURCE, ...(action === "answer" ? { tag: "fact" } : {}) }, { onConflict: "company_id,key" });
    await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "profile.review" });
    revalidatePath("/step0");
    return;
  }
  // 保留・戻すで、承認・修正済みの最後の1項目を外すと STEP 0 が空になり、プログラムの途中で STEP 1 以降が開けなくなる。資料も無ければ止める
  if ((action === "hold" || action === "reopen") && company.status !== "onboarding" && ["approved", "fixed"].includes(cur?.status ?? "")) {
    const [{ count: docs }, { count: items }] = await Promise.all([
      supabase.from("company_documents").select("id", { count: "exact", head: true }).eq("company_id", company.id),
      supabase.from("profile_items").select("key", { count: "exact", head: true }).eq("company_id", company.id).in("status", ["approved", "fixed"]),
    ]);
    if ((docs ?? 0) === 0 && (items ?? 0) <= 1) fail("これが承認・修正済みの最後の項目です。外すと STEP 1 以降が開けなくなるので、先に資料を登録するか、別の項目を承認してから操作してください。");
  }
  if (action === "approve") {
    // 画面で見ていた下書きと、いまの下書きが違う（別のタブで作り直された）ときは承認しない
    if (nl(String(formData.get("shown") ?? "")) !== nl(cur?.draft)) { revalidatePath("/step0"); return; }
    patch.value = cur?.draft ?? null; patch.status = "approved";
  }
  // 直す・答える（メンバーの修正案を採用するときも、この文で直す）。下書きは空にする（承認・修正済みの項目に残った下書き＝メンバーの修正案、と見分けるため）
  else if (action === "fix" || action === "answer") { if (!after) return; patch.value = after; patch.draft = null; patch.status = "fixed"; patch.source = OWN_SOURCE; if (action === "answer") patch.tag = "fact"; }
  // メンバーの修正案を見送る（確定した文はそのまま）
  else if (action === "dismiss") { if (!["approved", "fixed"].includes(cur?.status ?? "")) return; patch.draft = null; }
  else if (action === "hold") { patch.status = "held"; }
  // 戻す：自分で書いた（または承認した）文は残す
  // 戻す：確定・承認した文は消さずに下書きへ戻す（状態は「下書き」。もう一度承認・修正できる）
  else if (action === "reopen") {
    const keep = cur?.value ?? cur?.draft ?? null; patch.draft = keep; patch.value = null; patch.status = keep ? "draft" : "empty";
    // 御社が直した文を戻したときは「御社が書いた文」、承認したAIの文なら元の出所を残したまま印をつけ、AIの作り直しで上書きされないようにする
    if (cur?.value) patch.source = cur.status === "fixed" || cur.source === OWN_SOURCE ? OWN_SOURCE : (String(cur.source ?? "").startsWith(APPROVED_MARK) ? cur.source : `${APPROVED_MARK}${cur.source ? `・${cur.source}` : ""}`);
  }
  await supabase.from("profile_items").upsert({ ...(cur ?? {}), ...patch }, { onConflict: "company_id,key" });
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "profile.review" });
  revalidatePath("/step0");
}

/** 競合他社を登録（最大3社＋参考1社）。会社名は必須、商品・サービス名とURLは任意 */
export async function addCompetitor(formData: FormData) {
  const { company, user, supabase } = await requireStage("step0");
  const name = cut(String(formData.get("name") || "").trim(), MAX.title);
  const product = cut(String(formData.get("product") || "").trim(), MAX.title);
  const raw = String(formData.get("website") || "").trim();
  const isReference = formData.get("is_reference") === "1";
  if (!name) fail("競合の会社名を入れてください。");
  const website = raw ? normalizeWebUrl(raw) : null;
  if (raw && !website) fail("URLの形式が正しくありません（例：https://www.example.co.jp）。");
  const { data: ex } = await supabase.from("competitors").select("id, is_reference, name").eq("company_id", company.id);
  if ((ex ?? []).some((c) => c.name.trim() === name)) fail("同じ名前の競合がすでに登録されています。");
  const n = (ex ?? []).filter((c) => c.is_reference === isReference).length;
  if (!isReference && n >= 3) fail("競合は3社までです。参考にしたい会社は「参考」として1社入れられます。");
  if (isReference && n >= 1) fail("参考の会社は1社までです。");
  const { error } = await supabase.from("competitors").insert({ company_id: company.id, name, product: product || null, website, is_reference: isReference, created_by: user.id });
  if (error) fail("登録できませんでした" + (/product|created_by/.test(error.message) ? "（SQL 0027 が未実行の可能性があります）" : "") + "：" + error.message);
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "competitor.add", payload: { name, reference: isReference } });
  revalidatePath("/step0");
}

export async function removeCompetitor(formData: FormData) {
  const { company, user, supabase } = await requireStage("step0");
  const id = String(formData.get("id") || "");
  await supabase.from("competitors").delete().eq("id", id).eq("company_id", company.id);
  await supabase.from("activity_log").insert({ company_id: company.id, user_id: user.id, event: "competitor.remove", payload: { id } });
  revalidatePath("/step0");
}
