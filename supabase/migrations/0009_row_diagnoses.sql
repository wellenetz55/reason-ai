-- STEP 2 冒頭の「ふわっと診断」結果（AIの点検と言い直し案）。行ごとに最新1件
create table if not exists row_diagnoses (
  row_id uuid primary key references sheet_rows(id) on delete cascade,
  vague_score int not null default 0,          -- 0=具体的 … 3=ふわっと
  issues jsonb not null default '[]',          -- ["数字が無い", "どの会社でも言える", ...]
  suggestion_value text,                        -- 言い直し案（提供価値）
  suggestion_experience text,                   -- 言い直し案（体験価値）
  resolved text,                                -- null | accepted | kept
  checked_at timestamptz not null default now()
);
alter table row_diagnoses enable row level security;
create policy op_all_row_diagnoses on row_diagnoses for all using (is_operator()) with check (is_operator());
create policy cu_row_diagnoses on row_diagnoses for all
  using (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id()))
  with check (exists (select 1 from sheet_rows r where r.id = row_id and r.company_id = current_company_id()));
