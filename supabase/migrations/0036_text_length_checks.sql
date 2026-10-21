-- お客様が書ける文の長さに、DBでも上限を設ける（APIを直接呼ばれて巨大な文が入り、AIの下書きが使えなくなるのを防ぐ）。
-- 画面・サーバ処理の上限（500〜2000字）より余裕を持たせた値。既存の行は検査しない（not valid）。
alter table sheet_rows add constraint sheet_rows_len check (
  char_length(coalesce(value_raw, '')) <= 2000 and char_length(coalesce(experience_value_v1, '')) <= 2000
  and char_length(coalesce(experience_value, '')) <= 2000 and char_length(coalesce(because_phrase, '')) <= 2000
  and char_length(coalesce(target, '')) <= 1000
) not valid;
alter table brakes add constraint brakes_len check (
  char_length(coalesce(customer_words, '')) <= 2000 and char_length(coalesce(counter_message, '')) <= 2000
  and char_length(coalesce(because, '')) <= 2000
) not valid;
alter table profile_items add constraint profile_items_len check (
  char_length(coalesce(value, '')) <= 5000 and char_length(coalesce(draft, '')) <= 10000
) not valid;
alter table competitors add constraint competitors_len check (
  char_length(coalesce(name, '')) <= 500 and char_length(coalesce(product, '')) <= 500
) not valid;
alter table homeworks add constraint homeworks_len check (
  char_length(coalesce(answer, '')) <= 10000 and char_length(coalesce(pass_reason, '')) <= 10000
) not valid;
