-- 會議紀錄表
-- 用於儲存 Seameet 或其他來源的會議紀錄

CREATE TABLE IF NOT EXISTS meeting_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 關聯 (至少要有一個)
    prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id),  -- 上傳者/負責業務

    -- 會議基本資訊
    title VARCHAR(255) NOT NULL,
    meeting_date TIMESTAMP NOT NULL,
    duration_minutes INTEGER,
    meeting_url TEXT,
    participants TEXT,  -- 參與者名單 (文字)

    -- 會議內容 (從 Seameet 貼上)
    raw_content TEXT,           -- 原始貼上的內容
    transcript TEXT,            -- 逐字稿
    summary TEXT,               -- 摘要
    action_items JSONB,         -- 行動項目 [{task, assignee, due_date, status}]
    key_points JSONB,           -- 重點摘要 [string]

    -- AI 分析結果
    ai_matched_prospect_id UUID REFERENCES prospects(id),
    ai_match_confidence FLOAT,  -- 配對信心度 0-1
    ai_match_reason TEXT,       -- 為什麼配對到這個洽談案
    ai_stage_suggestion VARCHAR(50),    -- 建議的階段
    ai_sentiment VARCHAR(20),           -- positive/neutral/negative
    ai_close_probability VARCHAR(20),   -- high/medium/low
    ai_next_steps TEXT,                 -- 建議下一步
    ai_client_concerns JSONB,           -- 客戶顧慮
    ai_decisions JSONB,                 -- 會議決議

    -- 狀態
    status VARCHAR(20) DEFAULT 'pending',  -- pending, analyzed, reviewed
    is_ai_suggestion_applied BOOLEAN DEFAULT false,

    -- 來源
    source VARCHAR(50) DEFAULT 'manual',  -- manual, seameet, google_drive
    source_file_name VARCHAR(255),

    -- 時間戳記
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_meeting_records_prospect ON meeting_records(prospect_id);
CREATE INDEX IF NOT EXISTS idx_meeting_records_project ON meeting_records(project_id);
CREATE INDEX IF NOT EXISTS idx_meeting_records_user ON meeting_records(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_records_date ON meeting_records(meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_records_status ON meeting_records(status);

-- 更新時間觸發器
CREATE OR REPLACE FUNCTION update_meeting_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meeting_records_updated_at ON meeting_records;
CREATE TRIGGER meeting_records_updated_at
    BEFORE UPDATE ON meeting_records
    FOR EACH ROW
    EXECUTE FUNCTION update_meeting_records_updated_at();

-- RLS 政策
ALTER TABLE meeting_records ENABLE ROW LEVEL SECURITY;

-- 所有已登入用戶可以查看
CREATE POLICY "Users can view all meeting records"
    ON meeting_records FOR SELECT
    TO authenticated
    USING (true);

-- 已登入用戶可以新增
CREATE POLICY "Users can insert meeting records"
    ON meeting_records FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 已登入用戶可以更新
CREATE POLICY "Users can update meeting records"
    ON meeting_records FOR UPDATE
    TO authenticated
    USING (true);

-- 已登入用戶可以刪除自己上傳的
CREATE POLICY "Users can delete own meeting records"
    ON meeting_records FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

COMMENT ON TABLE meeting_records IS '會議紀錄表 - 儲存從 Seameet 或其他來源匯入的會議紀錄';
