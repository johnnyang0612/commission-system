-- ==========================================
-- 修復 Stage 約束與前端不匹配問題
-- 修復拖曳功能錯誤
-- ==========================================

-- 1. 刪除舊的 stage 約束
ALTER TABLE prospects 
DROP CONSTRAINT IF EXISTS valid_stage;

-- 2. 創建新的 stage 約束以匹配前端 STAGES
ALTER TABLE prospects 
ADD CONSTRAINT valid_stage CHECK (stage IN (
    '初談', '提案', '報價', '談判', '待簽約', '已失單', '已轉換'
));

-- 3. 更新現有資料中的舊階段名稱到新階段名稱
UPDATE prospects 
SET stage = CASE 
    WHEN stage = '報價中' THEN '報價'
    WHEN stage = '等客戶回覆' THEN '談判'  
    WHEN stage = '確認簽約' THEN '待簽約'
    ELSE stage
END
WHERE stage IN ('報價中', '等客戶回覆', '確認簽約');

-- 4. 確保 manual_order 和 stage_updated_at 欄位存在
ALTER TABLE prospects 
ADD COLUMN IF NOT EXISTS manual_order INTEGER DEFAULT 0;

ALTER TABLE prospects 
ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 5. 為新欄位建立索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_prospects_manual_order ON prospects(manual_order);
CREATE INDEX IF NOT EXISTS idx_prospects_stage_updated_at ON prospects(stage_updated_at);

-- 6. 確保觸發器存在 - 階段變更時自動更新時間戳
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

-- 重新建立觸發器
DROP TRIGGER IF EXISTS update_prospect_stage_timestamp_trigger ON prospects;
CREATE TRIGGER update_prospect_stage_timestamp_trigger
    BEFORE UPDATE ON prospects
    FOR EACH ROW
    EXECUTE FUNCTION update_prospect_stage_timestamp();

-- 7. 為現有記錄設定預設值
UPDATE prospects 
SET 
    stage_updated_at = COALESCE(stage_updated_at, updated_at, created_at),
    manual_order = COALESCE(manual_order, 0)
WHERE stage_updated_at IS NULL OR manual_order IS NULL;

-- 8. 為現有記錄按階段設定 manual_order
WITH ordered_prospects AS (
    SELECT 
        id,
        stage,
        ROW_NUMBER() OVER (PARTITION BY stage ORDER BY created_at ASC) as row_num
    FROM prospects
    WHERE manual_order = 0
)
UPDATE prospects p
SET 
    manual_order = op.row_num,
    updated_at = NOW()
FROM ordered_prospects op
WHERE p.id = op.id;

-- 驗證修復
SELECT 
    'Stage 約束已修復' as status,
    COUNT(*) as total_prospects,
    COUNT(DISTINCT stage) as unique_stages
FROM prospects;

-- 顯示各階段的資料
SELECT 
    stage,
    COUNT(*) as count,
    MIN(manual_order) as min_order,
    MAX(manual_order) as max_order
FROM prospects
GROUP BY stage
ORDER BY 
    CASE stage
        WHEN '初談' THEN 1
        WHEN '提案' THEN 2
        WHEN '報價' THEN 3
        WHEN '談判' THEN 4
        WHEN '待簽約' THEN 5
        WHEN '已失單' THEN 6
        WHEN '已轉換' THEN 7
        ELSE 8
    END;

-- 檢查約束
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint 
WHERE conrelid = 'prospects'::regclass 
AND conname = 'valid_stage';

SELECT 'Stage 約束修復完成！拖曳功能現在應該正常工作。' as final_message;