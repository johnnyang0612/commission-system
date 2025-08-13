-- 修復 deleted_files 表，將 TEXT 欄位改為 UUID 類型

-- 修改欄位類型為 UUID
ALTER TABLE deleted_files 
ALTER COLUMN project_id TYPE UUID USING project_id::UUID,
ALTER COLUMN cost_id TYPE UUID USING cost_id::UUID,
ALTER COLUMN document_id TYPE UUID USING document_id::UUID;

-- 檢查修復結果
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'deleted_files' 
ORDER BY ordinal_position;