-- 會議去重與多群組支援
-- 當同一會議在多個群組被提到時，智能合併

-- 新增欄位
ALTER TABLE meeting_reminders
ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS related_group_ids TEXT[],  -- 相關群組（當多群組提到同一會議時）
ADD COLUMN IF NOT EXISTS source_group_type VARCHAR(50),  -- 來源群組類型 (prospect/internal/team)
ADD COLUMN IF NOT EXISTS detected_client_name VARCHAR(255);  -- AI 從訊息偵測到的客戶名稱

-- 索引
CREATE INDEX IF NOT EXISTS idx_meeting_reminders_cancelled ON meeting_reminders(is_cancelled);
CREATE INDEX IF NOT EXISTS idx_meeting_reminders_prospect ON meeting_reminders(prospect_id);
CREATE INDEX IF NOT EXISTS idx_meeting_reminders_project ON meeting_reminders(project_id);

COMMENT ON COLUMN meeting_reminders.is_cancelled IS '會議是否已取消';
COMMENT ON COLUMN meeting_reminders.related_group_ids IS '相關群組 IDs（同一會議在多處被提到）';
COMMENT ON COLUMN meeting_reminders.source_group_type IS '首次偵測的群組類型';
