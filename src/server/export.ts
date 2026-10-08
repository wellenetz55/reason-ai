import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STAGES } from "@/lib/stages";
import { FACETS } from "@/lib/facets";
import { PROFILE_ITEMS } from "@/lib/profileItems";

/**
 * 「これまでのデータ」をExcelに書き出す。
 * 指定ステップまでのシートを含める（STEP 3 なら 会社・提供価値・ブレーキ まで）。
 * 顧客ロールのクライアントで読むので、RLS により自社分だけが入る。method_* は一切触らない。
 */
const KIND = { distrust: "不信（本当かな）", unnecessary: "不要（必要ないかも）", unfit: "不適（合わないかも）", nourgent: "不急（今じゃなくても）" } as Record<string, string>;
const TAG = { fact: "事実", verify: "要確認", hypothesis: "仮説" } as Record<string, string>;
const STATUS = { active: "有効", merged: "統合済", dropped: "保留（落とした）", held: "保留", separate: "別立て" } as Record<string, string>;
const VERDICT = { superior: "優位", equal: "同等", inferior: "劣位", unknown: "不明" } as Record<string, string>;
const EV = { named_voice: "実名の声", public_voice: "公開レビュー", third_party: "第三者評価", own_fact: "自社の事実" } as Record<string, string>;
const yn = (v: boolean | null | undefined) => (v === true ? "はい" : v === false ? "いいえ" : "");
const facetLabel = (k: string | null) => FACETS.find((f) => f.key === k)?.label ?? k ?? "";

export async function buildExport(supabase: SupabaseClient, companyId: string, companyName: string, status: string, upToKey: string) {
  const upTo = Math.max(0, STAGES.findIndex((s) => s.key === upToKey));
  const has = (key: string) => STAGES.findIndex((s) => s.key === key) <= upTo;

  const wb = new ExcelJS.Workbook();
  wb.creator = "選ばれる理由AI";
  const stamp = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date());

  const addSheet = (name: string, cols: { header: string; key: string; width?: number }[], rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name, { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 24 }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9ECF5" } };
    rows.forEach((r) => ws.addRow(r));
    ws.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });
    ws.headerFooter.oddFooter = `&L${companyName}　提供価値シート&C&P / &N&R${stamp} 出力`;
    return ws;
  };

  // 表紙
  const cover = wb.addWorksheet("表紙");
  cover.columns = [{ width: 18 }, { width: 70 }];
  cover.addRows([
    ["会社", companyName],
    ["出力日時", stamp],
    ["含まれる範囲", STAGES.slice(0, upTo + 1).map((s) => `${s.step} ${s.label}`).join(" / ")],
    ["", ""],
    ["この資料について", "選ばれる理由AI（運営：株式会社ベレネッツ）で作成途中の提供価値シートです。仮説の行は「仮説」と印がついています。社外への配布はお控えください。"],
  ]);
  cover.getColumn(1).font = { bold: true };
  cover.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });

  // STEP 0 会社（御社の説明: 承認・直した項目を優先。B の回答も）
  if (has("step0")) {
    const [{ data: items }, { data: sum }, { data: comps }] = await Promise.all([
      supabase.from("profile_items").select("key, draft, value, status, tag, source").eq("company_id", companyId),
      supabase.from("company_profile_summary").select("q1_before, q1_after").eq("company_id", companyId).maybeSingle(),
      supabase.from("competitors").select("name, website, is_reference").eq("company_id", companyId),
    ]);
    const STATUS_I: Record<string, string> = { empty: "未記入", draft: "AIの下書き", approved: "承認済み", fixed: "直して確定", held: "保留" };
    const byKey = new Map((items ?? []).map((i) => [i.key, i]));
    const rows = PROFILE_ITEMS.map((d) => {
      const it = byKey.get(d.key);
      const text = d.fixed ? (sum?.q1_after ?? sum?.q1_before ?? "") : (["approved", "fixed"].includes(it?.status ?? "") ? it?.value : it?.draft) ?? "";
      return { group: d.group === "A" ? "資料から" : "御社に聞く", item: d.label, value: text, status: d.fixed ? (text ? "適合診断の記録" : "") : STATUS_I[it?.status ?? "empty"], tag: d.fixed ? "" : TAG[it?.tag ?? ""] ?? "", source: it?.source ?? "" };
    });
    addSheet("0 会社", [{ header: "区分", key: "group", width: 10 }, { header: "項目", key: "item", width: 26 }, { header: "内容", key: "value", width: 80 }, { header: "状態", key: "status", width: 12 }, { header: "根拠", key: "tag", width: 8 }, { header: "出所", key: "source", width: 24 }], rows);
    if (comps?.length) addSheet("0 競合", [{ header: "競合", key: "name", width: 30 }, { header: "Web", key: "website", width: 40 }, { header: "参考", key: "ref", width: 8 }], comps.map((c) => ({ name: c.name, website: c.website, ref: c.is_reference ? "○" : "" })));
  }

  // STEP 1〜2 提供価値
  const { data: rows } = await supabase.from("sheet_rows").select("*").eq("company_id", companyId).order("seq");
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  if (has("diverge")) {
    const cols = [
      { header: "No", key: "seq", width: 6 }, { header: "面", key: "facet", width: 14 }, { header: "周", key: "round", width: 5 },
      { header: "提供価値（御社は〜できる）", key: "raw", width: 44 }, { header: "体験価値（だから、お客様は〜と感じることができる）", key: "exp1", width: 44 }, { header: "誰向け", key: "target", width: 16 },
    ];
    if (has("merge")) cols.push({ header: "統合後", key: "merged", width: 40 }, { header: "最終案", key: "final", width: 40 }, { header: "一言で", key: "one", width: 30 }, { header: "状態", key: "status", width: 12 }, { header: "順位", key: "rank", width: 6 });
    if (has("trust")) cols.push({ header: "体験価値（磨いた後）", key: "exp", width: 44 }, { header: "なぜなら（根拠）", key: "because", width: 44 }, { header: "根拠タグ", key: "btag", width: 8 }, { header: "当社しか", key: "onlyus", width: 8 }, { header: "根拠の種類", key: "axis", width: 14 });
    addSheet(has("merge") ? "1-2 提供価値" : "1 提供価値", cols, (rows ?? []).map((r) => ({
      seq: r.seq, facet: facetLabel(r.facet), round: r.round, raw: r.value_raw, exp1: r.experience_value_v1, target: r.target,
      merged: r.value_merged, final: r.value_final, one: r.one_liner, status: STATUS[r.status] ?? r.status, rank: r.rank,
      exp: r.experience_value ?? r.experience_value_v1, because: r.because_phrase, btag: TAG[r.because_tag] ?? "", onlyus: r.because_only_us ? "○" : "", axis: ({ systematic: "体系的", perceived: "知覚される", created: "生み出された" } as Record<string, string>)[r.trust_axis] ?? r.trust_axis,
    })));
  }

  // STEP 3〜4 ブレーキ
  if (has("brakes")) {
    const { data: brakes } = await supabase.from("brakes").select("*, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId).eq("status", "active");
    const cols = [{ header: "行No", key: "seq", width: 6 }, { header: "提供価値", key: "raw", width: 36 }, { header: "種類", key: "kind", width: 18 }, { header: "お客様の言葉（ブレーキ）", key: "words", width: 40 }];
    if (has("counter")) cols.push({ header: "先回りの答え", key: "counter", width: 44 }, { header: "なぜなら", key: "because", width: 36 }, { header: "根拠", key: "tag", width: 8 });
    addSheet(has("counter") ? "3-4 ブレーキ" : "3 ブレーキ", cols, (brakes ?? []).map((b) => ({
      seq: byId.get(b.row_id)?.seq, raw: byId.get(b.row_id)?.value_final ?? byId.get(b.row_id)?.value_raw,
      kind: KIND[b.kind] ?? b.kind, words: b.customer_words, counter: b.counter_message, because: b.because, tag: TAG[b.evidence_tag] ?? b.evidence_tag,
    })));
  }

  // STEP 5 競合比較
  if (has("trust")) {
    const { data: cc } = await supabase.from("competitor_comparisons").select("*, sheet_rows!inner(company_id), competitors(name)").eq("sheet_rows.company_id", companyId);
    if (cc?.length) addSheet("5 競合比較", [{ header: "行No", key: "seq", width: 6 }, { header: "提供価値", key: "raw", width: 36 }, { header: "競合", key: "comp", width: 24 }, { header: "判定", key: "verdict", width: 8 }, { header: "理由", key: "reason", width: 40 }, { header: "要確認", key: "verify", width: 30 }],
      cc.map((c) => ({ seq: byId.get(c.row_id)?.seq, raw: byId.get(c.row_id)?.value_final ?? byId.get(c.row_id)?.value_raw, comp: (c.competitors as { name: string } | null)?.name, verdict: VERDICT[c.verdict] ?? c.verdict, reason: c.reason, verify: c.to_verify })));
  }

  // STEP 6 リトマス試験紙
  if (has("litmus")) {
    const [{ data: ln }, { data: lm }] = await Promise.all([
      supabase.from("litmus_niche").select("*, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId),
      supabase.from("litmus_market").select("*, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId),
    ]);
    const m = new Map((lm ?? []).map((x) => [x.row_id, x]));
    const ids = new Set([...(ln ?? []).map((x) => x.row_id), ...(lm ?? []).map((x) => x.row_id)]);
    addSheet("6 リトマス試験紙", [
      { header: "行No", key: "seq", width: 6 }, { header: "提供価値", key: "raw", width: 36 },
      { header: "痛みは切実か", key: "q1", width: 12 }, { header: "探しているか", key: "q2", width: 12 },
      { header: "投資", key: "a", width: 6 }, { header: "強み", key: "b", width: 6 }, { header: "実現", key: "c", width: 6 }, { header: "競合に勝つ", key: "d", width: 8 }, { header: "社内の熱", key: "e", width: 8 }, { header: "目的合致", key: "f", width: 8 },
      { header: "マグニチュード", key: "mag", width: 30 }, { header: "合計", key: "total", width: 6 },
    ], [...ids].map((id) => { const n = (ln ?? []).find((x) => x.row_id === id); const s = m.get(id); return {
      seq: byId.get(id)?.seq, raw: byId.get(id)?.value_final ?? byId.get(id)?.value_raw, q1: yn(n?.q1_pain_urgency), q2: yn(n?.q2_actively_seeking),
      a: s?.investment, b: s?.strength_asset, c: s?.feasibility, d: s?.beat_competitor, e: s?.internal_passion, f: s?.brand_purpose_fit, mag: s?.magnitude_text, total: s?.total,
    }; }).sort((x, y) => (x.seq ?? 0) - (y.seq ?? 0)));
  }

  // STEP 7 証拠
  if (has("evidence")) {
    const { data: ev } = await supabase.from("evidences").select("*, sheet_rows!inner(company_id)").eq("sheet_rows.company_id", companyId);
    addSheet("7 証拠", [{ header: "行No", key: "seq", width: 6 }, { header: "提供価値", key: "raw", width: 36 }, { header: "何の証拠か", key: "what", width: 24 }, { header: "内容", key: "content", width: 50 }, { header: "種類", key: "kind", width: 14 }, { header: "出どころ", key: "source", width: 24 }, { header: "強さ", key: "strength", width: 8 }],
      (ev ?? []).map((e) => ({ seq: byId.get(e.row_id)?.seq, raw: byId.get(e.row_id)?.value_final ?? byId.get(e.row_id)?.value_raw, what: e.what, content: e.content, kind: EV[e.kind] ?? e.kind, source: e.source, strength: e.strength })));
  }

  // FINAL 展開（顧客向けビューのみ。techniques_json は含めない）
  if (has("deploy")) {
    const { data: dep } = await supabase.from("deployments_customer").select("*").eq("company_id", companyId);
    if (dep?.length) addSheet("F 展開", Object.keys(dep[0]).filter((k) => !["id", "company_id"].includes(k)).map((k) => ({ header: k, key: k, width: 30 })), dep as Record<string, unknown>[]);
  }

  return wb.xlsx.writeBuffer();
}
