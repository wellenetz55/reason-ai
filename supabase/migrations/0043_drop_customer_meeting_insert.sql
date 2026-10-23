-- お客様が面談（社内打合せ）を直接データベースに作れる古い許可が残っていた。アプリは使っておらず、
-- 実施済み・日時・会議URLを自由に書けてしまうので外す（面談はベレネッツが登録する）
drop policy if exists cu_meetings_ins on company_meetings;
