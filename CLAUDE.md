# reason-ai（選ばれる理由AI）

ベレネッツが提供する「提供価値シート」8週間プログラムのブラウザアプリ。仕様は `docs/spec/` が正。

## 構成
- Next.js (App Router, TypeScript) + Tailwind + shadcn/ui
- Supabase（Postgres / Auth / Storage）。マイグレーションは `supabase/migrations/`
- Vercel にデプロイ。Cron は `vercel.json`
- AI: Anthropic API をサーバ側からのみ呼ぶ（`src/server/ai/`）

## 必ず守ること
1. **メソッド資産（固定文・7面の問い・手法表・システムプロンプト本文）はリポジトリに置かない。** `method_*` テーブルか環境変数から読む。顧客向けAPIレスポンスに `method_*` と `deployments.techniques_json` を含めない
2. AIの禁則は `docs/spec/05-ai-behavior.md`。出力前フィルタ（`src/server/ai/outputFilter.ts`）を必ず通す
3. 顧客ロールのデータアクセスは RLS で `company_id` 分離。service role はサーバ側のみ
4. `sheet_rows` は物理削除しない（status で管理）
5. 状態遷移（`companies.status`）は operator 操作かスケジューラのみ。顧客からは変えられない
6. UIは `docs/spec/07-design.md` の原則に従う。チャット窓を主役にしない。白紙を見せない

## 開発
- `npm run dev` / `npm run build` / `npm run lint`
- 環境変数: `.env.example` を参照。`ANTHROPIC_API_KEY` は Vercel の環境変数に手で入れる（リポジトリに書かない）

## 読む順
`docs/spec/00-overview.md` → `01-data-model.md` → `02`〜`04` 画面 → `05-ai-behavior.md` → `06-notifications.md` → `07-design.md`
