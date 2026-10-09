-- 顧客が診断結果ページを開いた記録（初回はベレネッツに通知）
alter table diagnosis_results
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists view_count int not null default 0;
