-- ==========================================
-- 修復 action_records 表格問題
-- 解決新增行動記錄失敗的錯誤
-- ==========================================

-- 1. 確保 action_records 表格存在且結構正確
CREATE TABLE IF NOT EXISTS action_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- 使用 Supabase 標準函數
  prospect_id UUID NOT NULL,
  user_id UUID,  -- 暫時允許 NULL 以避免外鍵問題
  action_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  action_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  next_followup_date DATE,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 新增外鍵約束（如果不存在）
ALTER TABLE action_records 
DROP CONSTRAINT IF EXISTS fk_action_records_prospect;

ALTER TABLE action_records 
ADD CONSTRAINT fk_action_records_prospect 
FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE;

-- 3. 新增用戶外鍵約束（如果 users 表存在）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        -- 先刪除可能存在的約束
        ALTER TABLE action_records 
        DROP CONSTRAINT IF EXISTS fk_action_records_user;
        
        -- 新增外鍵約束
        ALTER TABLE action_records 
        ADD CONSTRAINT fk_action_records_user 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. 確保索引存在
CREATE INDEX IF NOT EXISTS idx_action_records_prospect_id ON action_records(prospect_id);
CREATE INDEX IF NOT EXISTS idx_action_records_user_id ON action_records(user_id);
CREATE INDEX IF NOT EXISTS idx_action_records_action_date ON action_records(action_date);
CREATE INDEX IF NOT EXISTS idx_action_records_created_at ON action_records(created_at);

-- 5. 新增更新時間戳觸發器
CREATE OR REPLACE FUNCTION update_action_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_action_records_updated_at_trigger ON action_records;
CREATE TRIGGER update_action_records_updated_at_trigger
    BEFORE UPDATE ON action_records
    FOR EACH ROW
    EXECUTE FUNCTION update_action_records_updated_at();

-- 6. 檢查並清理無效的資料
-- 刪除無效的 prospect_id 記錄
DELETE FROM action_records 
WHERE prospect_id NOT IN (SELECT id FROM prospects);

-- 清理無效的 user_id 記錄（如果 users 表存在）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        UPDATE action_records 
        SET user_id = NULL 
        WHERE user_id IS NOT NULL 
        AND user_id NOT IN (SELECT id FROM users);
    END IF;
END $$;

-- 7. 插入一些測試資料（如果表格是空的）
INSERT INTO action_records (prospect_id, user_id, action_type, content, action_date)
SELECT 
    p.id,
    p.owner_id,
    'phone',
    '系統測試：與 ' || p.client_name || ' 進行電話聯絡',
    NOW() - INTERVAL '1 hour'
FROM prospects p
WHERE p.owner_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM action_records WHERE prospect_id = p.id)
LIMIT 3;

-- 8. 驗證修復結果
SELECT 
    'Action Records 表格修復完成' as status,
    COUNT(*) as total_records
FROM action_records;

-- 檢查表格結構
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'action_records'
ORDER BY ordinal_position;

-- 檢查約束
SELECT 
    conname as constraint_name,
    contype as constraint_type
FROM pg_constraint 
WHERE conrelid = 'action_records'::regclass;

-- 檢查索引
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'action_records';

SELECT 'Action Records 修復完成！新增行動記錄功能現在應該正常工作。' as final_message;