-- 出典から採用した判断基準（原則）。中身はリポジトリに置かず、このテーブルにだけ入れる（method_* と同じ扱い）
create table if not exists method_principles (
  code text primary key,                 -- Q2, J1 など
  area text not null,                    -- 問い / 判定 / ブレーキ / 裏づけ / 展開 / 面談
  principle text not null,               -- 原則
  usage text not null,                   -- アプリでの使い方（AIに渡す判断基準）
  source text,                           -- 出典（AIには渡さない。管理画面と確認用）
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
alter table method_principles enable row level security;
revoke all on method_principles from anon, authenticated;
