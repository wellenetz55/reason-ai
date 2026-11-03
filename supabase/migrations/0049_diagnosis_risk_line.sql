-- 適合診断の結果：「放っておくとどうなるか」（面談で出た具体的な場面を一行。ベレネッツが書く／AIの下書き）
alter table diagnosis_results add column if not exists risk_line text;
alter table diagnosis_results add constraint diagnosis_results_risk_len check (char_length(coalesce(risk_line, '')) <= 400) not valid;
-- お客様のロールでも読める列に加える（0044 の列指定に追加）
grant select (risk_line) on diagnosis_results to authenticated;
