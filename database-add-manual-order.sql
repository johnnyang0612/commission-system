-- ==========================================
-- 新增手動排序功能到 prospects 表
-- Delta PRD v1.1 需求：支援卡片手動排序
-- ==========================================

-- 新增 manual_order 欄位到 prospects 表
ALTER TABLE prospects 
ADD COLUMN IF NOT EXISTS manual_order INTEGER DEFAULT 0;

-- 新增 stage_updated_at 欄位（用於追蹤階段更新時間）
ALTER TABLE prospects 
ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 為 manual_order 和 stage_updated_at 建立索引
CREATE INDEX IF NOT EXISTS idx_prospects_manual_order ON prospects(manual_order);
CREATE INDEX IF NOT EXISTS idx_prospects_stage_updated_at ON prospects(stage_updated_at);

-- 新增複合索引用於排序查詢（階段 + 手動排序 + 追蹤日期）
CREATE INDEX IF NOT EXISTS idx_prospects_sorting 
ON prospects(stage, manual_order ASC, next_followup_date ASC NULLS LAST);

-- 更新現有記錄的 stage_updated_at
UPDATE prospects 
SET stage_updated_at = updated_at 
WHERE stage_updated_at IS NULL;

-- 建立觸發器：當階段改變時自動更新 stage_updated_at
CREATE OR REPLACE FUNCTION update_prospect_stage_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    -- 如果 stage 欄位有變更，更新 stage_updated_at
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        NEW.stage_updated_at = NOW();
    END IF;
    
    -- 一般的 updated_at 更新
    NEW.updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 建立觸發器（先刪除舊的以避免衝突）
DROP TRIGGER IF EXISTS update_prospect_stage_timestamp_trigger ON prospects;

CREATE TRIGGER update_prospect_stage_timestamp_trigger
    BEFORE UPDATE ON prospects
    FOR EACH ROW
    EXECUTE FUNCTION update_prospect_stage_timestamp();

-- 建立函數：重置某個階段中所有案件的手動排序
CREATE OR REPLACE FUNCTION reset_manual_order_for_stage(p_stage TEXT)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    UPDATE prospects 
    SET manual_order = 0, updated_at = NOW()
    WHERE stage = p_stage;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 建立函數：自動為新案件設定手動排序（設為該階段的最大值+1）
CREATE OR REPLACE FUNCTION set_auto_manual_order()
RETURNS TRIGGER AS $$
DECLARE
    v_max_order INTEGER;
BEGIN
    -- 只對新插入的記錄處理
    IF TG_OP = 'INSERT' THEN
        -- 取得該階段目前最大的 manual_order
        SELECT COALESCE(MAX(manual_order), 0) + 1
        INTO v_max_order
        FROM prospects
        WHERE stage = NEW.stage;
        
        NEW.manual_order = v_max_order;
        NEW.stage_updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 建立觸發器：新案件自動設定排序
CREATE TRIGGER set_auto_manual_order_trigger
    BEFORE INSERT ON prospects
    FOR EACH ROW
    EXECUTE FUNCTION set_auto_manual_order();

-- 為現有案件設定初始的 manual_order 值
-- 按照建立時間排序，給每個階段的案件設定順序編號
WITH ordered_prospects AS (
    SELECT 
        id,
        stage,
        ROW_NUMBER() OVER (PARTITION BY stage ORDER BY created_at ASC) as row_num
    FROM prospects
    WHERE manual_order = 0 OR manual_order IS NULL
)
UPDATE prospects p
SET 
    manual_order = op.row_num,
    updated_at = NOW()
FROM ordered_prospects op
WHERE p.id = op.id;

-- 驗證安裝
SELECT 
    'Manual Order 功能已成功安裝' as status,
    COUNT(*) as total_prospects_with_order
FROM prospects
WHERE manual_order > 0;

-- 顯示各階段的排序狀況
SELECT 
    stage,
    COUNT(*) as prospect_count,
    MIN(manual_order) as min_order,
    MAX(manual_order) as max_order,
    AVG(manual_order) as avg_order
FROM prospects
GROUP BY stage
ORDER BY stage;

-- 顯示新增的欄位資訊
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'prospects' 
AND column_name IN ('manual_order', 'stage_updated_at')
ORDER BY column_name;

-- 完成訊息
SELECT 'Manual Order 手動排序功能已成功新增到 prospects 表！' as final_message;