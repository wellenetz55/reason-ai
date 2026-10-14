-- 0024 面談メモ（適合診断の記録）で Word(.docx) と iPhone の写真(HEIC) を受け付ける
-- テキスト類（.md/.vtt/.csv など）はアプリ側で text/plain として送るので、ここでは足さない
update storage.buckets
set allowed_mime_types = array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/heic'
]
where id = 'company-docs';
