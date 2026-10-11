-- 適合診断の記録（ベレネッツだけが見る）。対象の範囲・7問の答え・録音の書き起こし・判定メモ
create table if not exists diagnosis_intakes (
  company_id uuid primary key references companies(id) on delete cascade,
  target_kind text not null default 'company',  -- company（会社全体）/ brand（事業部・ブランド）/ product（商品・サービス）
  target_name text,                              -- 対象の名前（例：○○ジム）
  target_note text,                              -- 運営会社・グループ内の関係（例：親会社が買収した子会社ブランド）
  answers jsonb not null default '{}'::jsonb,    -- {"q1":"…","q7":"…","extra":"追加で聞いたこと"}
  transcript text,                               -- 録音の書き起こし（お客様の発言そのまま）
  transcript_name text,
  verdict text,                                  -- fit / unfit / hold（顧客には出さない）
  verdict_note text,
  held_on date,                                  -- 診断を行った日
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table diagnosis_intakes enable row level security;
create policy op_all_intake on diagnosis_intakes for all using (is_operator()) with check (is_operator());
revoke all on diagnosis_intakes from anon;
