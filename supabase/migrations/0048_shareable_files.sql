-- 面談メモ・資料のファイルを「お客様に見せてよい（AIの材料にする）」と「社内だけ」に分ける。
-- AIの下書き（お客様に見える）には、見せてよいファイルの文字だけを渡す。既存のファイルも含め、初めは「社内だけ」。
alter table diagnosis_intake_files add column if not exists shareable boolean not null default false;
alter table meeting_files add column if not exists shareable boolean not null default false;
