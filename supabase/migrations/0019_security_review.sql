-- セキュリティ点検（2026-10-11）の修正

-- H1. profiles は画面からの挿入・削除をさせない（権限の書き換えを防ぐ。正規の書き込みは service role 経由）
revoke insert, delete on profiles from authenticated;

-- M1. 削除したメンバー（disabled_at あり）は、手元に残ったトークンでもデータを読めないようにする
create or replace function is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'operator' and disabled_at is null)
$$;
create or replace function current_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid() and disabled_at is null
$$;

-- L8. sheet_rows は誰も物理削除できない（status で管理する決まり）
revoke delete on sheet_rows from authenticated;

-- L3. 顧客は deployments を読むだけ（承認状態などを自分で書き換えさせない）
drop policy if exists cu_dep on deployments;
create policy cu_dep_sel on deployments for select using (company_id = current_company_id());

-- L3. 顧客が宿題で書き換えられるのは回答の列だけ。質問はベレネッツの返事を付けた状態で作れない
create or replace function guard_customer_homework() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() then
    if new.title is distinct from old.title or new.why is distinct from old.why
       or new.ask_whom_hint is distinct from old.ask_whom_hint or new.due_at is distinct from old.due_at
       or new.priority is distinct from old.priority or new.company_id is distinct from old.company_id then
      raise exception 'customers can only answer homework';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_customer_homework on homeworks;
create trigger trg_guard_customer_homework before update on homeworks for each row execute function guard_customer_homework();

create or replace function guard_customer_question() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() then
    new.answered_body := null;
    new.answered_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_customer_question on questions_to_operator;
create trigger trg_guard_customer_question before insert on questions_to_operator for each row execute function guard_customer_question();

-- バックアップのダウンロード用（非公開）。ZIP を一時的に置き、署名付きURLで渡す
insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing;
