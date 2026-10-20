-- 0026 面談の記録（キックオフ・確認①②③・中間チェック・顧問月次・社内）。ベレネッツだけが見る。お客様には出ない
-- 聞いたこと・書き起こし・メモファイルを残し、AIの下書き（会社プロフィール・STEP 1 の問いと下書き・なぜなら）の材料にする
create table if not exists meeting_records (
  meeting_id uuid primary key references company_meetings(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  attendees text,
  one_liner text,              -- キックオフ：当日の「御社を一言で言うと？」の答え
  notes text,                  -- 面談で聞いたこと（お客様の発言・要点）。AIに渡す
  memo text,                   -- ベレネッツの気づき。AIに渡さない
  pairs_text text,             -- その場で作った組（1行1組「提供価値｜体験価値」）。シートの行として入れる元
  pairs_imported_at timestamptz,
  transcript text,
  transcript_name text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table meeting_records enable row level security;
create policy op_all_meeting_records on meeting_records for all using (is_operator()) with check (is_operator());

create table if not exists meeting_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  meeting_id uuid not null references company_meetings(id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  text_content text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists meeting_files_meeting on meeting_files(meeting_id, created_at);
alter table meeting_files enable row level security;
create policy op_all_meeting_files on meeting_files for all using (is_operator()) with check (is_operator());
-- リセット（reset_company）の 'communication' で company_meetings を消すと、記録・ファイルも cascade で消える
