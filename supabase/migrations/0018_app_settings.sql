-- サーバ側だけが読む設定（Dropbox 連携のトークン、最後のバックアップ結果など）。
-- RLS を有効にしてポリシーを作らない＝ service role 以外は読めない・書けない
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
revoke all on app_settings from anon, authenticated;
