-- 為 project_documents 表添加軟刪除欄位（簡化版）

-- 添加 deleted_at 欄位
ALTER TABLE project_documents 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- 檢查結果
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'project_documents' 
AND column_name IN ('deleted_at', 'document_status')
ORDER BY column_name;