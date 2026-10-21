-- 0028 ふわっと診断：「この組だけAIで別案を出す」で、前に出した案を覚えておく（同じ案を繰り返さないため）
alter table row_diagnoses add column if not exists redraft_history jsonb not null default '[]'::jsonb;
