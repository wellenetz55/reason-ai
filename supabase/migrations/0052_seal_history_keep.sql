-- 封を解いても、変更の記録（理由・前後の文）を消さずに残す。
-- これまでは封（sheet_locks）を消すと、その封についた記録も一緒に消えていた（on delete cascade）。
-- 記録に会社と確認セッションを持たせ、封が消えても誰の・どのセッションの記録か分かるようにする。
alter table sheet_lock_history add column if not exists company_id uuid references companies(id) on delete cascade;
alter table sheet_lock_history add column if not exists session text;
update sheet_lock_history h set company_id = l.company_id, session = l.session::text
  from sheet_locks l where l.id = h.lock_id and (h.company_id is null or h.session is null);

-- 記録を書くときに、封から会社とセッションを自動で入れる（アプリ側の書き込みはそのまま）
create or replace function sheet_lock_history_fill() returns trigger language plpgsql set search_path = public as $$
begin
  if new.lock_id is not null and (new.company_id is null or new.session is null) then
    select l.company_id, l.session::text into new.company_id, new.session from sheet_locks l where l.id = new.lock_id;
  end if;
  return new;
end $$;
drop trigger if exists sheet_lock_history_fill on sheet_lock_history;
create trigger sheet_lock_history_fill before insert on sheet_lock_history for each row execute function sheet_lock_history_fill();

-- 封を消しても記録は残す（lock_id だけ空になる）
alter table sheet_lock_history alter column lock_id drop not null;
alter table sheet_lock_history drop constraint if exists sheet_lock_history_lock_id_fkey;
alter table sheet_lock_history add constraint sheet_lock_history_lock_id_fkey foreign key (lock_id) references sheet_locks(id) on delete set null;
create index if not exists sheet_lock_history_company_idx on sheet_lock_history (company_id, changed_at desc);
