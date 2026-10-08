-- 顧客からのエラーレポート（左メニュー最下部「エラーレポート」）
create table if not exists error_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references profiles(id),
  page text,
  user_agent text,
  body text not null,
  screenshot_path text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_note text
);
alter table error_reports enable row level security;
create policy op_all_error_reports on error_reports for all using (is_operator()) with check (is_operator());
create policy cu_error_reports_select on error_reports for select using (company_id = current_company_id());
create policy cu_error_reports_insert on error_reports for insert with check (company_id = current_company_id());
