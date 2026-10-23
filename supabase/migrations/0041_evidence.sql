-- STEP 7 証拠を集める
-- AIが資料から見つけた候補（candidate）と、御社が採用した証拠（adopted）を分ける。どの「なぜなら」を裏づけるかを claim_ref に持つ
alter table evidences add column if not exists status text not null default 'adopted';
alter table evidences add constraint evidences_status check (status in ('candidate', 'adopted')) not valid;
alter table evidences add column if not exists claim_ref text;            -- 'row'（STEP 5 のなぜなら）／'brake:<uuid>'（STEP 4 の⑥）／null（その他）
alter table evidences add column if not exists created_by author_kind not null default 'customer';
alter table evidences add constraint evidences_len check (
  char_length(coalesce(what, '')) <= 600 and char_length(content) <= 2000 and char_length(coalesce(source, '')) <= 300
  and char_length(coalesce(claim_ref, '')) <= 60 and char_length(coalesce(strength, '')) <= 10
) not valid;
create index if not exists evidences_row_idx on evidences (row_id);
