-- STEP 1: 行の「確定」（ぴったり来たときに顧客が確定する。承認済みは左に確定バー）
alter table sheet_rows add column if not exists confirmed_at timestamptz;
