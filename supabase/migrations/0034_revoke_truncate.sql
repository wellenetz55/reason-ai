-- 行の権限（RLS）を通らない操作（TRUNCATE＝表を丸ごと空にする 等）を、ログイン中の利用者・未ログインから外す。
-- 今のAPI経由では実行できない操作だが、権限として残しておく理由がないため。
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
