-- 完整的 Storage 設定腳本
-- 在 Supabase SQL Editor 中執行

-- 第1步：創建 Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('invoices', 'invoices', true),
  ('receipts', 'receipts', true),
  ('documents', 'documents', true),
  ('contracts', 'contracts', true),
  ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- 第2步：創建 Storage 政策
-- 注意：如果遇到權限問題，需要使用 Supabase Dashboard 手動設定

-- 刪除可能存在的舊政策
DROP POLICY IF EXISTS "Allow authenticated users to upload files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to view files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update files" ON storage.objects;

-- 創建 Storage 政策（如果有權限）
DO $$
BEGIN
  -- 嘗試創建政策，如果失敗則跳過
  BEGIN
    -- 允許已認證用戶上傳文件
    EXECUTE 'CREATE POLICY "Allow authenticated upload" ON storage.objects 
             FOR INSERT TO authenticated 
             WITH CHECK (bucket_id IN (''invoices'', ''receipts'', ''documents'', ''contracts'', ''photos''))';
    
    -- 允許已認證用戶查看文件
    EXECUTE 'CREATE POLICY "Allow authenticated select" ON storage.objects 
             FOR SELECT TO authenticated 
             USING (bucket_id IN (''invoices'', ''receipts'', ''documents'', ''contracts'', ''photos''))';
    
    -- 允許已認證用戶刪除文件
    EXECUTE 'CREATE POLICY "Allow authenticated delete" ON storage.objects 
             FOR DELETE TO authenticated 
             USING (bucket_id IN (''invoices'', ''receipts'', ''documents'', ''contracts'', ''photos''))';
    
    -- 允許已認證用戶更新文件
    EXECUTE 'CREATE POLICY "Allow authenticated update" ON storage.objects 
             FOR UPDATE TO authenticated 
             USING (bucket_id IN (''invoices'', ''receipts'', ''documents'', ''contracts'', ''photos''))';
    
    RAISE NOTICE 'Storage policies created successfully';
    
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Insufficient privilege to create storage policies. Please use Supabase Dashboard to set policies manually.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error creating storage policies: %. Please use Supabase Dashboard.', SQLERRM;
  END;
END $$;

-- 檢查結果
SELECT 
  id, 
  name, 
  public,
  created_at
FROM storage.buckets 
WHERE id IN ('invoices', 'receipts', 'documents', 'contracts', 'photos')
ORDER BY created_at;

-- 如果上面的政策創建失敗，請在 Supabase Dashboard 中手動設定：
/*
進入 Storage → 選擇每個 bucket → Policies → Add Policy：

Policy Name: Allow authenticated users full access
Operation: All
Target roles: authenticated  
USING expression: true
WITH CHECK expression: true

需要為每個 bucket (invoices, receipts, documents, contracts, photos) 都設定這個政策
*/