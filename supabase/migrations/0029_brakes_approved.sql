-- STEP 3「お客様のブレーキ」: 顧客の承認を記録する列。仮説タグは承認しても黄のまま（証拠がつくまで）
alter table brakes add column if not exists approved_at timestamptz;
create index if not exists brakes_row_kind on brakes (row_id, kind);
