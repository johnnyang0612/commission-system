-- 修復 deleted_files 表的數據類型問題

-- 將 UUID 欄位改為 TEXT 類型以支持 UUID 字符串
ALTER TABLE deleted_files 
ALTER COLUMN project_id TYPE TEXT,
ALTER COLUMN cost_id TYPE TEXT,
ALTER COLUMN document_id TYPE TEXT;

-- 檢查修復結果
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'deleted_files' 
AND column_name IN ('project_id', 'cost_id', 'document_id')
ORDER BY column_name;