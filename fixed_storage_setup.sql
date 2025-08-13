-- 修正版 Storage 設定腳本

-- 第1步：創建 Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('invoices', 'invoices', true),
  ('receipts', 'receipts', true),
  ('documents', 'documents', true),
  ('contracts', 'contracts', true),
  ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- 檢查 Buckets 創建結果
SELECT 
  id, 
  name, 
  public,
  created_at
FROM storage.buckets 
WHERE id IN ('invoices', 'receipts', 'documents', 'contracts', 'photos')
ORDER BY created_at;

-- 第2步：嘗試創建 Storage 政策（可能需要特殊權限）
-- 如果以下命令失敗，請使用手動方式在 Dashboard 設定

-- 清理可能存在的舊政策
DROP POLICY IF EXISTS "Allow authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated select" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update" ON storage.objects;

-- 創建新政策
CREATE POLICY "Allow authenticated upload" ON storage.objects 
FOR INSERT TO authenticated 
WITH CHECK (bucket_id IN ('invoices', 'receipts', 'documents', 'contracts', 'photos'));

CREATE POLICY "Allow authenticated select" ON storage.objects 
FOR SELECT TO authenticated 
USING (bucket_id IN ('invoices', 'receipts', 'documents', 'contracts', 'photos'));

CREATE POLICY "Allow authenticated delete" ON storage.objects 
FOR DELETE TO authenticated 
USING (bucket_id IN ('invoices', 'receipts', 'documents', 'contracts', 'photos'));

CREATE POLICY "Allow authenticated update" ON storage.objects 
FOR UPDATE TO authenticated 
USING (bucket_id IN ('invoices', 'receipts', 'documents', 'contracts', 'photos'));

-- 檢查政策創建結果
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'objects' AND schemaname = 'storage';