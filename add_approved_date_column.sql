-- 為 project_documents 表添加 approved_date 欄位

-- 添加 approved_date 欄位
ALTER TABLE project_documents 
ADD COLUMN IF NOT EXISTS approved_date DATE;

-- 檢查結果
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'project_documents' 
AND column_name IN ('approved_date', 'deleted_at', 'document_status')
ORDER BY column_name;