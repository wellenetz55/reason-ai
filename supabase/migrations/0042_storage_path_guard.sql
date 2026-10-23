-- 保管場所の道筋（storage_path / screenshot_path）をお客様が書き換えて、他社のファイルや別の保管場所に届かないようにする。
-- アプリは自社フォルダ直下の <uuid>.<拡張子>（以前の形 <uuid>-<名前>）しか作らない。それ以外の形は、お客様のロールでは保存できない。
create or replace function guard_customer_document_path() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() and new.storage_path is not null then
    if new.storage_path !~ ('^' || current_company_id()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,5}|-[A-Za-z0-9_][A-Za-z0-9_.-]{0,120})$')
       or position('..' in new.storage_path) > 0 then
      raise exception 'invalid storage_path';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_customer_document_path on company_documents;
create trigger trg_guard_customer_document_path before insert or update on company_documents for each row execute function guard_customer_document_path();

-- エラーレポートの画像：<会社ID>/error-reports/<uuid>.<拡張子> だけを残す（それ以外は捨てる）
create or replace function guard_customer_error_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() then
    new.read_at := null;
    new.resolved_at := null;
    new.resolved_note := null;
    new.user_id := auth.uid();
    if new.screenshot_path is not null
       and new.screenshot_path !~ ('^' || current_company_id()::text || '/error-reports/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,5}$') then
      new.screenshot_path := null;
    end if;
  end if;
  return new;
end $$;
