-- 適合診断の結果（合格した会社に、アプリ内の最初の画面として見せる）
create table if not exists diagnosis_results (
  company_id uuid primary key references companies(id) on delete cascade,
  one_liner_before text,                 -- 面談で聞いた「御社を一言で」
  seeds jsonb not null default '[]',     -- [{feature, experience, tag}] 選ばれる理由の芽（最大3）
  brakes jsonb not null default '[]',    -- [{kind, words}] まだ言葉になっていないブレーキ（最大2）
  fit_reasons jsonb not null default '[]', -- [{condition, quote}] 適合の理由（面談の発言引用つき）
  competitor jsonb,                      -- {name, claims:[...]} 競合1社の訴求
  candidate_dates jsonb not null default '[]', -- [timestamptz] キックオフ候補日
  operator_note text,                    -- 平松の一言
  chosen_date timestamptz,               -- 顧客が選んだキックオフ日
  chosen_at timestamptz,
  published_at timestamptz,              -- 公開（招待送付）日時
  expires_at timestamptz,                -- 閲覧期限（穏やかな期限）
  created_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table diagnosis_results enable row level security;
create policy op_all_diagnosis on diagnosis_results for all using (is_operator()) with check (is_operator());
create policy cu_diagnosis_select on diagnosis_results for select using (company_id = current_company_id() and published_at is not null);
