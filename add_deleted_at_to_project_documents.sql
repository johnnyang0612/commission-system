-- 為 project_documents 表添加軟刪除欄位

-- 檢查是否已存在 deleted_at 欄位
DO $$
BEGIN
    -- 添加 deleted_at 欄位（如果不存在）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_documents' 
        AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE project_documents 
        ADD COLUMN deleted_at TIMESTAMP;
        RAISE NOTICE 'Added deleted_at column to project_documents table';
    ELSE
        RAISE NOTICE 'deleted_at column already exists in project_documents table';
    END IF;
END$$;

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