-- Step0: 貼り付けテキストを保存する列と、資料ファイル用の非公開バケット
alter table company_documents add column if not exists text_content text;
alter table company_documents add column if not exists mime_type text;
alter table company_documents add column if not exists size_bytes bigint;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-docs', 'company-docs', false, 26214400, array['application/pdf','image/png','image/jpeg','image/webp','text/plain'])
on conflict (id) do nothing;

-- ファイルの読み書きはサーバ（service role）経由のみ。ブラウザから直接は触らせない
