-- お客様は、自社の「お客様自身の操作」の記録だけ読める。
-- ベレネッツ側の記録（適合診断のAI判定案・書き起こしのファイル名・サインインリンク発行など）は読めない。
-- 書き込みは、自分の名前（auth.uid()）でだけ。
drop policy if exists cu_log_sel on activity_log;
create policy cu_log_sel on activity_log for select
  using (company_id = current_company_id()
         and user_id in (select id from profiles where company_id = current_company_id()));

drop policy if exists cu_log_ins on activity_log;
create policy cu_log_ins on activity_log for insert
  with check (company_id = current_company_id() and user_id = auth.uid());
