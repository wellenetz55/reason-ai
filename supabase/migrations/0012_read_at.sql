-- 管理画面: 顧客からの質問・エラーレポートの既読管理（会社ページを開いたら既読）
alter table questions_to_operator add column if not exists read_at timestamptz;
alter table error_reports add column if not exists read_at timestamptz;
