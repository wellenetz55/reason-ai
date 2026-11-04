-- サインインリンクの送信回数の上限（同じアドレスへの連打・同じ接続元からの大量送信で、
-- Supabase のメール送信枠が尽きて本物のサインイン・招待が届かなくなるのを防ぐ）。
-- アドレスと接続元は、そのままは残さずハッシュで記録する。サーバ（service role）だけが使う。
create table if not exists signin_attempts (
  id bigserial primary key,
  email_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists signin_attempts_email_idx on signin_attempts (email_hash, created_at desc);
create index if not exists signin_attempts_ip_idx on signin_attempts (ip_hash, created_at desc);
alter table signin_attempts enable row level security; -- ポリシーなし＝顧客・ベレネッツの画面からは読めない
revoke all on signin_attempts from anon, authenticated;
revoke all on sequence signin_attempts_id_seq from anon, authenticated;

-- 数えて記録するのを1回で行う（同時に2つ送られても両方が通らないように）
create or replace function signin_throttle(p_email text, p_ip text, p_email_max int, p_ip_max int)
returns text language plpgsql security definer set search_path = public as $$
declare e int; i int;
begin
  perform pg_advisory_xact_lock(hashtext(p_email));
  select count(*) into e from signin_attempts where email_hash = p_email and created_at > now() - interval '1 hour';
  if e >= p_email_max then return 'email'; end if;
  select count(*) into i from signin_attempts where ip_hash = p_ip and created_at > now() - interval '1 hour';
  if i >= p_ip_max then return 'ip'; end if;
  insert into signin_attempts (email_hash, ip_hash) values (p_email, p_ip);
  return 'ok';
end $$;
revoke execute on function signin_throttle(text, text, int, int) from public, anon, authenticated;
grant execute on function signin_throttle(text, text, int, int) to service_role;
