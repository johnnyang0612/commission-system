-- ==========================================
-- 創建 Activities 表格 (Delta PRD v1.1) - 修復版本
-- 用於個人任務管理，與案件分離但綁定案子
-- ==========================================

-- 創建 activities 表格
CREATE TABLE IF NOT EXISTS activities (
    activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL,
    owner_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('phone', 'meet', 'demo', 'quote', 'send', 'visit', 'presentation', 'negotiation', 'contract', 'followup', 'other')),
    note TEXT,
    due_at TIMESTAMP WITH TIME ZONE,
    done_at TIMESTAMP WITH TIME ZONE,
    result VARCHAR(50) CHECK (result IN ('next', 'none', 'lost', 'defer', 'completed')),
    next_follow_up_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建外鍵約束
-- 注意：假設 prospects 表格代表 deals，users 表格已存在
ALTER TABLE activities 
ADD CONSTRAINT fk_activities_deal 
FOREIGN KEY (deal_id) REFERENCES prospects(id) ON DELETE CASCADE;

ALTER TABLE activities 
ADD CONSTRAINT fk_activities_owner 
FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;

-- 創建索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_activities_deal_id ON activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_activities_owner_id ON activities(owner_id);
CREATE INDEX IF NOT EXISTS idx_activities_due_at ON activities(due_at);
CREATE INDEX IF NOT EXISTS idx_activities_done_at ON activities(done_at);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_activities_result ON activities(result);

-- 創建複合索引用於任務清單查詢
CREATE INDEX IF NOT EXISTS idx_activities_owner_status ON activities(owner_id, done_at, due_at);

-- 創建更新時間戳的觸發器
CREATE OR REPLACE FUNCTION update_activities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_activities_updated_at
    BEFORE UPDATE ON activities
    FOR EACH ROW
    EXECUTE FUNCTION update_activities_updated_at();

-- 插入測試資料（使用更合適的日期生成）
INSERT INTO activities (deal_id, owner_id, type, note, due_at, result) 
SELECT 
    p.id as deal_id,
    p.owner_id,
    CASE 
        WHEN RANDOM() < 0.3 THEN 'phone'
        WHEN RANDOM() < 0.5 THEN 'meet'
        WHEN RANDOM() < 0.7 THEN 'demo'
        WHEN RANDOM() < 0.8 THEN 'quote'
        ELSE 'followup'
    END as type,
    CASE 
        WHEN RANDOM() < 0.25 THEN '客戶要求技術規格說明，需準備產品展示'
        WHEN RANDOM() < 0.5 THEN '確認預算範圍和決策流程'
        WHEN RANDOM() < 0.75 THEN '提供報價單，等待客戶回覆'
        ELSE '定期追蹤專案進度'
    END as note,
    -- 修復：使用隨機天數生成更真實的測試資料
    CASE 
        WHEN RANDOM() < 0.2 THEN NOW() - INTERVAL '2 days'  -- 逾期
        WHEN RANDOM() < 0.4 THEN NOW()  -- 今天
        WHEN RANDOM() < 0.7 THEN NOW() + (RANDOM() * 5 + 1) * INTERVAL '1 day' -- 1-6天內
        ELSE NOW() + (RANDOM() * 10 + 7) * INTERVAL '1 day' -- 7-17天後
    END as due_at,
    CASE 
        WHEN RANDOM() < 0.7 THEN 'next'
        WHEN RANDOM() < 0.9 THEN 'completed'
        ELSE 'defer'
    END as result
FROM prospects p 
WHERE p.stage NOT IN ('已失單', '已轉換')
AND EXISTS (SELECT 1 FROM users u WHERE u.id = p.owner_id)
LIMIT 20;

-- 驗證安裝
SELECT 
    'Activities 表格建立成功' as status,
    COUNT(*) as total_activities
FROM activities;

-- 顯示按到期日分組的任務統計
WITH grouped_tasks AS (
    SELECT 
        CASE 
            WHEN due_at < NOW() THEN '逾期'
            WHEN due_at::DATE = NOW()::DATE THEN '今天'
            WHEN due_at < NOW() + INTERVAL '7 days' THEN '即將到來'
            WHEN due_at IS NULL THEN '未排程'
            ELSE '未來'
        END as group_name,
        COUNT(*) as task_count
    FROM activities
    GROUP BY 
        CASE 
            WHEN due_at < NOW() THEN '逾期'
            WHEN due_at::DATE = NOW()::DATE THEN '今天'
            WHEN due_at < NOW() + INTERVAL '7 days' THEN '即將到來'
            WHEN due_at IS NULL THEN '未排程'
            ELSE '未來'
        END
)
SELECT group_name, task_count
FROM grouped_tasks
ORDER BY 
    CASE 
        WHEN group_name = '逾期' THEN 1
        WHEN group_name = '今天' THEN 2
        WHEN group_name = '即將到來' THEN 3
        WHEN group_name = '未排程' THEN 4
        ELSE 5
    END;

-- 顯示表格結構
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'activities'
ORDER BY ordinal_position;

-- 註解說明
COMMENT ON TABLE activities IS '個人任務管理表格 - 與案件綁定但獨立管理的行動項目';
COMMENT ON COLUMN activities.deal_id IS '關聯的案件ID (外鍵到 prospects 表格)';
COMMENT ON COLUMN activities.owner_id IS '任務負責人ID';
COMMENT ON COLUMN activities.type IS '任務類型：phone/meet/demo/quote/send/visit/presentation/negotiation/contract/followup/other';
COMMENT ON COLUMN activities.note IS '任務詳細說明';
COMMENT ON COLUMN activities.due_at IS '任務到期時間';
COMMENT ON COLUMN activities.done_at IS '任務完成時間';
COMMENT ON COLUMN activities.result IS '任務結果：next/none/lost/defer/completed';
COMMENT ON COLUMN activities.next_follow_up_at IS '下次追蹤時間';

-- 顯示成功訊息
SELECT 'Activities 系統已成功安裝並創建測試資料！' as final_message;