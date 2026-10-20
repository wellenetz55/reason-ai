-- 0027 競合に「商品・サービス名」を持たせる（STEP 0 でお客様が登録：会社名・商品/サービス名・URL）
alter table competitors add column if not exists product text;
alter table competitors add column if not exists created_by uuid references profiles(id);
