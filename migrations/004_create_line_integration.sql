-- LINE OA 整合資料表
-- 用於自動記錄 LINE 群組對話和檔案

-- ============================================
-- 1. LINE 群組對應表
-- ============================================
CREATE TABLE IF NOT EXISTS line_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- LINE 資訊
    group_id VARCHAR(255) UNIQUE NOT NULL,  -- LINE 群組 ID
    group_name VARCHAR(255),                 -- 群組名稱

    -- 關聯到系統
    prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

    -- 狀態
    is_active BOOLEAN DEFAULT true,
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP,

    -- 統計
    message_count INTEGER DEFAULT 0,
    file_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMP,

    -- 設定
    auto_analyze BOOLEAN DEFAULT true,       -- 是否自動 AI 分析
    notify_on_keyword BOOLEAN DEFAULT false, -- 關鍵字通知
    keywords TEXT[],                         -- 監控關鍵字

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 2. LINE 訊息紀錄表
-- ============================================
CREATE TABLE IF NOT EXISTS line_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- LINE 資訊
    group_id VARCHAR(255) NOT NULL,          -- LINE 群組 ID
    message_id VARCHAR(255) UNIQUE,          -- LINE 訊息 ID
    reply_token VARCHAR(255),                -- 回覆 token

    -- 發送者
    sender_id VARCHAR(255),                  -- LINE User ID
    sender_name VARCHAR(255),                -- 顯示名稱
    sender_type VARCHAR(20) DEFAULT 'unknown', -- customer, staff, bot
    sender_avatar_url TEXT,                  -- 頭像

    -- 訊息內容
    message_type VARCHAR(20) NOT NULL,       -- text, image, file, video, audio, sticker, location
    content TEXT,                            -- 文字內容
    sticker_id VARCHAR(50),                  -- 貼圖 ID
    sticker_package_id VARCHAR(50),          -- 貼圖包 ID

    -- 檔案相關
    file_name VARCHAR(255),
    file_size INTEGER,
    file_url TEXT,                           -- 下載後的 URL (存在 Supabase Storage)
    file_original_url TEXT,                  -- LINE CDN 原始 URL
    duration INTEGER,                        -- 音訊/影片長度 (秒)

    -- 位置資訊
    latitude FLOAT,
    longitude FLOAT,
    address TEXT,

    -- AI 分析
    ai_processed BOOLEAN DEFAULT false,
    ai_sentiment VARCHAR(20),                -- positive, neutral, negative
    ai_keywords TEXT[],                      -- 提取的關鍵字
    ai_is_important BOOLEAN DEFAULT false,   -- AI 判斷是否重要
    ai_importance_reason TEXT,               -- 為什麼重要

    -- 時間
    timestamp TIMESTAMP NOT NULL,            -- LINE 訊息時間
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 3. LINE 檔案版本追蹤表
-- ============================================
CREATE TABLE IF NOT EXISTS line_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 關聯
    message_id UUID REFERENCES line_messages(id) ON DELETE CASCADE,
    group_id VARCHAR(255) NOT NULL,
    prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

    -- 檔案資訊
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),                   -- pdf, docx, xlsx, image, etc.
    file_size INTEGER,
    mime_type VARCHAR(100),

    -- 儲存
    storage_path TEXT,                       -- Supabase Storage 路徑
    public_url TEXT,                         -- 公開 URL

    -- 版本控制
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES line_files(id),
    is_latest BOOLEAN DEFAULT true,

    -- 文件類型分類 (AI 判斷)
    document_category VARCHAR(50),           -- quotation, proposal, contract, spec, other

    -- 知識庫整合
    is_in_knowledge_base BOOLEAN DEFAULT false,
    embedding_id UUID,                       -- 關聯到 document_embeddings

    -- 上傳者
    uploaded_by_name VARCHAR(255),
    uploaded_by_id VARCHAR(255),

    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 4. LINE 對話摘要表 (每日/每週自動產生)
-- ============================================
CREATE TABLE IF NOT EXISTS line_conversation_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    group_id VARCHAR(255) NOT NULL,
    prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,

    -- 摘要期間
    period_type VARCHAR(20) NOT NULL,        -- daily, weekly, custom
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,

    -- 統計
    message_count INTEGER DEFAULT 0,
    participant_count INTEGER DEFAULT 0,
    file_count INTEGER DEFAULT 0,

    -- AI 分析結果
    summary TEXT,                            -- 對話摘要
    key_topics TEXT[],                       -- 主要話題
    action_items JSONB,                      -- 行動項目
    decisions JSONB,                         -- 決議事項
    client_concerns TEXT[],                  -- 客戶顧慮

    -- 階段分析
    ai_stage_suggestion VARCHAR(50),         -- 建議的洽談階段
    ai_stage_confidence FLOAT,
    ai_stage_reason TEXT,

    -- 情緒分析
    overall_sentiment VARCHAR(20),           -- positive, neutral, negative
    sentiment_trend VARCHAR(20),             -- improving, stable, declining

    -- 風險警示
    risk_alerts JSONB,                       -- [{type, description, severity}]

    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 索引
-- ============================================
CREATE INDEX IF NOT EXISTS idx_line_groups_prospect ON line_groups(prospect_id);
CREATE INDEX IF NOT EXISTS idx_line_groups_project ON line_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_line_groups_active ON line_groups(is_active);

CREATE INDEX IF NOT EXISTS idx_line_messages_group ON line_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_line_messages_timestamp ON line_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_line_messages_type ON line_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_line_messages_sender ON line_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_line_messages_ai ON line_messages(ai_processed);

CREATE INDEX IF NOT EXISTS idx_line_files_group ON line_files(group_id);
CREATE INDEX IF NOT EXISTS idx_line_files_prospect ON line_files(prospect_id);
CREATE INDEX IF NOT EXISTS idx_line_files_type ON line_files(file_type);
CREATE INDEX IF NOT EXISTS idx_line_files_kb ON line_files(is_in_knowledge_base);

CREATE INDEX IF NOT EXISTS idx_line_summaries_group ON line_conversation_summaries(group_id);
CREATE INDEX IF NOT EXISTS idx_line_summaries_period ON line_conversation_summaries(period_start, period_end);

-- ============================================
-- 觸發器：更新統計
-- ============================================
CREATE OR REPLACE FUNCTION update_line_group_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE line_groups
    SET
        message_count = message_count + 1,
        last_message_at = NEW.timestamp,
        updated_at = NOW()
    WHERE group_id = NEW.group_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS line_message_stats_trigger ON line_messages;
CREATE TRIGGER line_message_stats_trigger
    AFTER INSERT ON line_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_line_group_stats();

-- ============================================
-- RLS 政策
-- ============================================
ALTER TABLE line_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_conversation_summaries ENABLE ROW LEVEL SECURITY;

-- line_groups
CREATE POLICY "Authenticated users can view line_groups"
    ON line_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert line_groups"
    ON line_groups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update line_groups"
    ON line_groups FOR UPDATE TO authenticated USING (true);

-- line_messages
CREATE POLICY "Authenticated users can view line_messages"
    ON line_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can insert line_messages"
    ON line_messages FOR INSERT TO authenticated WITH CHECK (true);

-- line_files
CREATE POLICY "Authenticated users can view line_files"
    ON line_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert line_files"
    ON line_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update line_files"
    ON line_files FOR UPDATE TO authenticated USING (true);

-- line_conversation_summaries
CREATE POLICY "Authenticated users can view summaries"
    ON line_conversation_summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert summaries"
    ON line_conversation_summaries FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- 註解
-- ============================================
COMMENT ON TABLE line_groups IS 'LINE 群組對應表 - 記錄哪些 LINE 群組對應到哪個洽談案';
COMMENT ON TABLE line_messages IS 'LINE 訊息紀錄表 - 自動記錄群組內所有訊息';
COMMENT ON TABLE line_files IS 'LINE 檔案追蹤表 - 記錄群組內分享的檔案，支援版本控制';
COMMENT ON TABLE line_conversation_summaries IS 'LINE 對話摘要表 - AI 自動產生的對話摘要';
