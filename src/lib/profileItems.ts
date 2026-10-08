/**
 * STEP 0「御社の説明」の項目。
 * A = 資料から AI が埋める（項目名は一般的なのでここに置く）
 * B = 御社に答えてもらう問い。問いの文面はベレネッツのメソッドなので DB（method_fixed_texts: step0_b11 …）から読む
 */
export type ProfileItemDef = { key: string; group: "A" | "B"; label: string; hint?: string; fixed?: boolean };

export const PROFILE_ITEMS: ProfileItemDef[] = [
  { key: "a1", group: "A", label: "事業内容", hint: "何を、誰に売っているか" },
  { key: "a2", group: "A", label: "主なお客様と、契約顧客の特徴", hint: "業種・規模・立場・共通点" },
  { key: "a3", group: "A", label: "自社で「強み」と言っていること", hint: "資料の言葉のまま" },
  { key: "a4", group: "A", label: "実績・賞・資格など自慢できるもの" },
  { key: "a5", group: "A", label: "品質・技術で自慢できるもの" },
  { key: "a6", group: "A", label: "数字で自慢できるもの", hint: "率・数量・スピード・無料サービス（顧客数、生産量、在庫点数など）" },
  { key: "a7", group: "A", label: "契約後の評価・喜ばれ方", hint: "実際の顧客の声を資料から抜き出す。出所のないものは書かない" },
  { key: "a8", group: "A", label: "競合として名前が出るところ" },
  { key: "a9", group: "A", label: "創業の経緯・大事にしていること" },
  { key: "a10", group: "A", label: "一言で言うと", hint: "適合診断でお聞きした言葉。ここでは変えません", fixed: true },
  { key: "b11", group: "B", label: "弱み" },
  { key: "b12", group: "B", label: "「なくてはならない」特徴" },
  { key: "b13", group: "B", label: "付き合いたくない顧客" },
  { key: "b14", group: "B", label: "ライバルの弱み" },
  { key: "b15", group: "B", label: "真似できないもの" },
];

export const STATUS_LABEL_ITEM: Record<string, string> = { empty: "未記入", draft: "AIの下書き", approved: "承認済み", fixed: "直して確定", held: "保留" };
