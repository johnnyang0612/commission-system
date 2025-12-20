-- 會議提醒表
CREATE TABLE IF NOT EXISTS meeting_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 來源
    group_id VARCHAR(255) NOT NULL,
    message_id UUID REFERENCES line_messages(id),
    
    -- 會議資訊
    meeting_time TIMESTAMP NOT NULL,
    meeting_title VARCHAR(500),
    meeting_link TEXT,           -- Google Meet / Zoom link
    meeting_location TEXT,
    
    -- 提醒對象
    remind_user_ids UUID[],      -- 要提醒的 user IDs
    remind_line_user_ids TEXT[], -- 對應的 LINE user IDs
    
    -- 提醒狀態
    reminded_1day BOOLEAN DEFAULT false,
    reminded_1hour BOOLEAN DEFAULT false,
    reminded_at_1day TIMESTAMP,
    reminded_at_1hour TIMESTAMP,
    
    -- AI 偵測
    detected_from_text TEXT,     -- 原始訊息
    confidence FLOAT,            -- 信心度
    
    -- 關聯
    prospect_id UUID REFERENCES prospects(id),
    project_id UUID REFERENCES projects(id),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_meeting_reminders_time ON meeting_reminders(meeting_time);
CREATE INDEX IF NOT EXISTS idx_meeting_reminders_group ON meeting_reminders(group_id);
CREATE INDEX IF NOT EXISTS idx_meeting_reminders_pending ON meeting_reminders(reminded_1day, reminded_1hour);

-- RLS
ALTER TABLE meeting_reminders DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE meeting_reminders IS '會議提醒表 - AI 從對話中偵測會議並自動提醒';
