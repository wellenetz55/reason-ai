-- 適合診断の結果：お客様のロールからは、閲覧の記録（何回・いつ開いたか）と作成者を読めないようにする
-- （行の見え方は RLS のまま。列の権限で絞る。ベレネッツの画面は service role で読む）
revoke select on diagnosis_results from authenticated;
grant select (company_id, one_liner_before, seeds, brakes, fit_reasons, competitor, candidate_dates, operator_note,
              chosen_date, chosen_at, published_at, expires_at, updated_at, summary)
  on diagnosis_results to authenticated;
