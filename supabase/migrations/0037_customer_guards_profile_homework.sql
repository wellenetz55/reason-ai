-- APIを直接呼ばれても、画面と同じ決まりを守らせる（お客様のときだけ。ベレネッツは対象外）

-- 御社の説明：固定の項目（a10「一言で言うと」）はお客様からは作れない・変えられない
create or replace function guard_customer_profile_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() and new.key = 'a10' then
    raise exception 'この項目はここでは変えられません';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_customer_profile_item on profile_items;
create trigger trg_guard_customer_profile_item before insert or update on profile_items for each row execute function guard_customer_profile_item();

-- 宿題：お客様が書けるのは答えの欄だけ、それも「未回答」のあいだだけ。答えた人は本人
create or replace function guard_customer_homework() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and not is_operator() then
    if old.status <> 'open' then
      raise exception '回答済みの宿題は変えられません';
    end if;
    if new.status not in ('answered', 'passed') then
      new.status := old.status;
    end if;
    new.company_id := old.company_id;
    new.priority := old.priority;
    new.title := old.title;
    new.why := old.why;
    new.ask_whom_hint := old.ask_whom_hint;
    new.due_at := old.due_at;
    new.created_at := old.created_at;
    new.answered_by := auth.uid();
    new.answered_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_customer_homework on homeworks;
create trigger trg_guard_customer_homework before update on homeworks for each row execute function guard_customer_homework();
