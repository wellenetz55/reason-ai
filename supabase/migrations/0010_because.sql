-- STEP 5 三連: 御社は〜できる。だから、お客様は〜と感じられる。なぜなら〜だから。
alter table sheet_rows add column if not exists because_tag evidence_tag;          -- なぜならの根拠タグ
alter table sheet_rows add column if not exists because_only_us boolean not null default false; -- 「当社しかありません」と言えるか
alter table sheet_rows add column if not exists because_by author_kind;            -- ai | customer
