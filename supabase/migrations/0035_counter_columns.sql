-- STEP 4「ブレーキを外す」: ⑤先回りの答え（counter_message）と ⑥なぜなら（because）は既存列。
-- ⑥の根拠タグ・書いた人・承認日時・前に出た案（別案を頼んだときに同じ案を避ける）を足す。
-- evidence_tag はブレーキ（④お客様の言葉）側の印として STEP 3 で使っているので、⑥用は別の列にする。
alter table brakes add column if not exists because_tag evidence_tag not null default 'hypothesis';
alter table brakes add column if not exists counter_by author_kind;
alter table brakes add column if not exists counter_approved_at timestamptz;
alter table brakes add column if not exists counter_history text[] not null default '{}';
