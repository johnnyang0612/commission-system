-- 步驟1: 添加 deleted_at 欄位
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;