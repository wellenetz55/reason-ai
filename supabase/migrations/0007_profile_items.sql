-- STEP 0「御社の説明」: 項目ごとの下書き・承認状態
create table if not exists profile_items (
  company_id uuid not null references companies(id) on delete cascade,
  key text not null,                 -- a1..a10 / b11..b15
  draft text,                        -- AIの下書き（Bは仮説）
  value text,                        -- 確定した文（承認＝draft をコピー／直す＝顧客の文／Bは顧客の回答）
  status text not null default 'empty', -- empty | draft | approved | fixed | held
  tag text,                          -- fact | verify | hypothesis
  source text,                       -- 出所（資料名・URL）
  updated_at timestamptz not null default now(),
  primary key (company_id, key)
);
alter table profile_items enable row level security;
create policy op_all_profile_items on profile_items for all using (is_operator()) with check (is_operator());
create policy cu_profile_items on profile_items for all using (company_id = current_company_id()) with check (company_id = current_company_id());
