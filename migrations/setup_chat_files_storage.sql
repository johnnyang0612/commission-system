-- ==========================================
-- LINE 檔案儲存 Storage 設定
-- ==========================================
-- 此腳本會建立 chat-files bucket 並設定所有必要的權限政策

-- Step 1: 建立 chat-files bucket (public)
-- ==========================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-files',
  'chat-files',
  true,  -- public bucket
  52428800,  -- 50MB 檔案大小限制
  NULL  -- 允許所有檔案類型
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Step 2: 刪除舊的政策（如果存在）
-- ==========================================
DROP POLICY IF EXISTS "Allow authenticated uploads to chat-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads from chat-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from chat-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to chat-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from chat-files" ON storage.objects;

-- Step 3: 建立上傳權限政策
-- ==========================================
-- 允許已認證用戶上傳檔案
CREATE POLICY "Allow authenticated uploads to chat-files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-files');

-- Step 4: 建立讀取權限政策
-- ==========================================
-- 因為 bucket 是 public 的，所有人都可以讀取
-- 但還是明確建立政策
CREATE POLICY "Allow public reads from chat-files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'chat-files');

-- Step 5: 建立刪除權限政策（可選）
-- ==========================================
-- 允許已認證用戶刪除檔案
CREATE POLICY "Allow authenticated deletes from chat-files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'chat-files');

-- Step 6: 建立更新權限政策（可選）
-- ==========================================
-- 允許已認證用戶更新檔案
CREATE POLICY "Allow authenticated updates to chat-files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-files')
WITH CHECK (bucket_id = 'chat-files');

-- ==========================================
-- 驗證設定
-- ==========================================
-- 執行以下查詢來確認設定成功：

-- 查看 bucket 資訊
SELECT id, name, public, file_size_limit, created_at
FROM storage.buckets
WHERE name = 'chat-files';

-- 查看所有政策
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'objects'
  AND policyname LIKE '%chat-files%';

-- ==========================================
-- 測試上傳（選擇性執行）
-- ==========================================
-- 這段在 SQL Editor 無法執行，但可以用來參考測試邏輯
-- 實際測試請使用 /storage-check 頁面
