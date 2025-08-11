-- 建立 Supabase Storage 儲存桶和政策
-- 這個檔案需要在 Supabase Dashboard 的 SQL Editor 中執行

-- 建立儲存桶
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('invoices', 'invoices', true),
  ('receipts', 'receipts', true),
  ('documents', 'documents', true),
  ('contracts', 'contracts', true),
  ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- 建立 RLS 政策
-- 允許已認證用戶上傳檔案
CREATE POLICY "Allow authenticated users to upload files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 允許已認證用戶查看檔案
CREATE POLICY "Allow authenticated users to view files" ON storage.objects
  FOR SELECT TO authenticated
  USING (true);

-- 允許已認證用戶刪除自己上傳的檔案
CREATE POLICY "Allow users to delete own files" ON storage.objects
  FOR DELETE TO authenticated
  USING (true);

-- 允許已認證用戶更新檔案
CREATE POLICY "Allow authenticated users to update files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (true);

-- 啟用 RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 更新 project_costs 表，添加檔案路徑 JSON 欄位
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS file_attachments JSONB DEFAULT '[]'::jsonb;

-- 為檔案附件建立索引
CREATE INDEX IF NOT EXISTS idx_project_costs_file_attachments ON project_costs USING gin(file_attachments);

-- 註解：file_attachments JSON 結構範例
-- [
--   {
--     "fileName": "invoice_001.pdf",
--     "originalName": "發票001.pdf", 
--     "filePath": "costs/2024/123/1234567890_abc123.pdf",
--     "publicUrl": "https://xxx.supabase.co/storage/v1/object/public/invoices/costs/2024/123/1234567890_abc123.pdf",
--     "fileSize": 1024000,
--     "fileType": "application/pdf",
--     "uploadedAt": "2024-01-15T10:30:00Z",
--     "bucket": "invoices"
--   }
-- ]