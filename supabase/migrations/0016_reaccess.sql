-- 解約した会社に、ベレネッツが期限付きでデータ（閲覧・ダウンロード）へのアクセスを戻すための列
alter table companies add column if not exists reaccess_until timestamptz;
