-- 面談にオンライン会議URLを持たせる（未設定なら顧客側に「会議URL未設定」と表示）
alter table company_meetings add column if not exists meeting_url text;
