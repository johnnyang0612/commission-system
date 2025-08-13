-- 只創建 Storage Buckets（不設置 RLS 政策）
-- 在 Supabase SQL Editor 中執行

-- 建立儲存桶
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('invoices', 'invoices', true),
  ('receipts', 'receipts', true),
  ('documents', 'documents', true),
  ('contracts', 'contracts', true),
  ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- 檢查結果
SELECT id, name, public FROM storage.buckets WHERE id IN ('invoices', 'receipts', 'documents', 'contracts', 'photos');