-- 創建軟刪除文件追蹤表

CREATE TABLE IF NOT EXISTS deleted_files (
    id SERIAL PRIMARY KEY,
    original_file_path TEXT NOT NULL,
    bucket_name VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER,
    file_type VARCHAR(100),
    deleted_by VARCHAR(100),
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    permanent_delete_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '230 days'),
    reason TEXT,
    
    -- 原始文件的關聯信息
    project_id INTEGER,
    cost_id INTEGER,
    document_id INTEGER,
    
    -- 軟刪除狀態
    is_permanently_deleted BOOLEAN DEFAULT FALSE,
    permanently_deleted_at TIMESTAMP
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_deleted_files_permanent_delete_at ON deleted_files(permanent_delete_at);
CREATE INDEX IF NOT EXISTS idx_deleted_files_deleted_by ON deleted_files(deleted_by);
CREATE INDEX IF NOT EXISTS idx_deleted_files_project_id ON deleted_files(project_id);
CREATE INDEX IF NOT EXISTS idx_deleted_files_bucket ON deleted_files(bucket_name);

-- 檢查結果
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'deleted_files' 
ORDER BY ordinal_position;