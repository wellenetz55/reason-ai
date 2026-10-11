-- ベレネッツ側の権限：スーパー管理者（メンバーの追加・削除・権限変更ができる）と管理者
alter table profiles add column if not exists is_super_admin boolean not null default false;
-- 削除したメンバー（履歴を残すため行は消さず、サインインを止める）
alter table profiles add column if not exists disabled_at timestamptz;
-- 最初のスーパー管理者：平松（hiramatsu@wellenetz.jp）
update profiles set is_super_admin = true
where role = 'operator' and id = (select id from auth.users where lower(email) = 'hiramatsu@wellenetz.jp');
