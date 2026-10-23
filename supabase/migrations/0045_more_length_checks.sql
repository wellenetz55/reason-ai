-- お客様のロールで書ける残りの表にも、DBで長さの上限を設ける（APIを直接呼ばれて巨大な文が入り、AIの費用や管理画面が重くなるのを防ぐ）。
-- 画面・サーバ処理の上限より余裕を持たせた値。既存の行は検査しない（not valid）。
alter table company_documents add constraint company_documents_len check (
  char_length(coalesce(text_content, '')) <= 200000 and char_length(coalesce(title, '')) <= 1000
  and char_length(coalesce(url, '')) <= 4000
) not valid;
alter table questions_to_operator add constraint questions_len check (
  char_length(coalesce(body, '')) <= 5000
) not valid;
alter table error_reports add constraint error_reports_len check (
  char_length(coalesce(body, '')) <= 5000 and char_length(coalesce(page, '')) <= 500
  and char_length(coalesce(user_agent, '')) <= 500
) not valid;
alter table activity_log add constraint activity_log_len check (
  char_length(event) <= 100 and pg_column_size(payload) <= 32768
) not valid;
alter table sheet_row_reviews add constraint sheet_row_reviews_len check (
  char_length(coalesce(before_text, '')) <= 20000 and char_length(coalesce(after_text, '')) <= 20000
  and (dwell_ms is null or dwell_ms between 0 and 86400000)
) not valid;
