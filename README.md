# reason-ai（選ばれる理由AI）

ベレネッツの「提供価値シート」8週間プログラムのブラウザアプリ。仕様は `docs/spec/`、開発の決まりは `CLAUDE.md`。

## セットアップ
1. `.env.example` を `.env.local` にコピーし、Supabase の URL / anon key / service role key、`ANTHROPIC_API_KEY`、`CRON_SECRET` を入れる
2. `npm install` → `npm run dev`
3. Supabase の Auth で operator のユーザーを作り、`profiles` に `role='operator'` で登録する

## デプロイ
Vercel。`main` への push で本番、PR でプレビュー。環境変数は Vercel 側に設定。
