-- 0025 適合診断の結果に「エグゼクティブサマリー」（お客様向けの要約。結果ページの一番上に出す）
alter table diagnosis_results add column if not exists summary text;
