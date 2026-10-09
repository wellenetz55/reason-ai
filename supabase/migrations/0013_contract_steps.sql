-- 発注・契約・入金の工程（契約と請求はアプリ外。日時だけ記録する）
alter table companies
  add column if not exists applied_at timestamptz,
  add column if not exists contracted_at timestamptz,
  add column if not exists paid_at timestamptz;
