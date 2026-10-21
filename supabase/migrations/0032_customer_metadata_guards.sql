-- お客様が書き込むときに、ベレネッツ側の項目（既読・対応済み・回答）や「誰が書いたか」を偽れないようにする。

-- 質問：回答・既読はお客様からは入れられない。書いた人は本人
create or replace function guard_customer_question() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() then
    new.answered_body := null;
    new.answered_at := null;
    new.read_at := null;
    new.created_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_customer_question on questions_to_operator;
create trigger trg_guard_customer_question before insert on questions_to_operator for each row execute function guard_customer_question();

-- エラーレポート：既読・対応済みはお客様からは入れられない。スクリーンショットは自社フォルダのものだけ
create or replace function guard_customer_error_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() then
    new.read_at := null;
    new.resolved_at := null;
    new.resolved_note := null;
    new.user_id := auth.uid();
    if new.screenshot_path is not null
       and (position('..' in new.screenshot_path) > 0
            or left(new.screenshot_path, length(current_company_id()::text) + 1) <> current_company_id()::text || '/') then
      new.screenshot_path := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_customer_error_report on error_reports;
create trigger trg_guard_customer_error_report before insert on error_reports for each row execute function guard_customer_error_report();

-- 行のメモ：書いた人は本人
create or replace function guard_customer_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() then
    new.author_id := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_customer_note on member_notes;
create trigger trg_guard_customer_note before insert or update on member_notes for each row execute function guard_customer_note();

-- 見直しの履歴：お客様は読む・足すだけ（書き換え・削除はできない）。足すときの見直した人は本人
drop policy if exists cu_reviews on sheet_row_reviews;
create policy cu_reviews_sel on sheet_row_reviews for select
  using (exists (select 1 from sheet_rows r where r.id = sheet_row_reviews.row_id and r.company_id = current_company_id()));
create policy cu_reviews_ins on sheet_row_reviews for insert
  with check (exists (select 1 from sheet_rows r where r.id = sheet_row_reviews.row_id and r.company_id = current_company_id())
              and reviewer_id = auth.uid() and company_writable());
