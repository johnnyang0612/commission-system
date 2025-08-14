-- ============================================
-- 川輝分潤管理系統 - 功能擴充
-- 新增未成案專案管理（Sales Pipeline）
-- ============================================

-- 1. 建立 prospects 表（未成案專案/洽談案）
CREATE TABLE IF NOT EXISTS prospects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_name TEXT NOT NULL,
    project_name TEXT NOT NULL,
    estimated_amount NUMERIC(12, 2) NOT NULL,
    commission_rate NUMERIC(5, 2) DEFAULT 15.00, -- 預設分潤比例
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL, -- 業務負責人
    stage TEXT NOT NULL DEFAULT '初談', -- 洽談階段
    expected_sign_date DATE,
    source TEXT, -- 客戶來源
    note TEXT, -- 備註
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    converted_to_project_id UUID REFERENCES projects(id) ON DELETE SET NULL, -- 轉換後的專案ID
    is_converted BOOLEAN DEFAULT FALSE, -- 是否已轉換為正式專案
    conversion_date TIMESTAMP WITH TIME ZONE, -- 轉換日期
    CONSTRAINT valid_stage CHECK (stage IN ('初談', '報價中', '等客戶回覆', '確認簽約', '已失單', '已轉換')),
    CONSTRAINT valid_commission_rate CHECK (commission_rate >= 0 AND commission_rate <= 100)
);

-- 2. 修改 projects 表，增加來源洽談案 ID
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS origin_prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL;

-- 3. 建立索引
CREATE INDEX IF NOT EXISTS idx_prospects_owner_id ON prospects(owner_id);
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_expected_sign_date ON prospects(expected_sign_date);
CREATE INDEX IF NOT EXISTS idx_prospects_is_converted ON prospects(is_converted);
CREATE INDEX IF NOT EXISTS idx_projects_origin_prospect_id ON projects(origin_prospect_id);

-- 4. 建立更新時間觸發器
CREATE OR REPLACE FUNCTION update_prospects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_prospects_updated_at_trigger
    BEFORE UPDATE ON prospects
    FOR EACH ROW
    EXECUTE FUNCTION update_prospects_updated_at();

-- 5. 建立 RLS 政策
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

-- 允許所有已認證用戶查看洽談案
CREATE POLICY "prospects_select_policy" ON prospects
    FOR SELECT
    TO authenticated
    USING (true);

-- 允許管理員和主管創建洽談案
CREATE POLICY "prospects_insert_policy" ON prospects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'leader')
        )
        OR owner_id = auth.uid() -- 業務可以為自己創建洽談案
    );

-- 允許管理員、主管和負責人更新洽談案
CREATE POLICY "prospects_update_policy" ON prospects
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'leader')
        )
        OR owner_id = auth.uid()
    );

-- 只允許管理員刪除洽談案
CREATE POLICY "prospects_delete_policy" ON prospects
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'admin'
        )
    );

-- 6. 建立洽談案活動記錄表（追蹤階段變化）
CREATE TABLE IF NOT EXISTS prospect_activities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    activity_type TEXT NOT NULL, -- 'stage_change', 'note_added', 'amount_updated', etc.
    old_value TEXT,
    new_value TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_prospect_activities_prospect_id ON prospect_activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_activities_created_at ON prospect_activities(created_at);

-- RLS 政策
ALTER TABLE prospect_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prospect_activities_policy" ON prospect_activities
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM prospects p
            WHERE p.id = prospect_activities.prospect_id
            AND (
                EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.id = auth.uid() 
                    AND u.role IN ('admin', 'leader', 'finance')
                )
                OR p.owner_id = auth.uid()
            )
        )
    );

-- 7. 建立函數：將洽談案轉換為正式專案
CREATE OR REPLACE FUNCTION convert_prospect_to_project(
    p_prospect_id UUID,
    p_project_code TEXT,
    p_project_type TEXT DEFAULT 'new',
    p_payment_template TEXT DEFAULT 'single'
)
RETURNS UUID AS $$
DECLARE
    v_project_id UUID;
    v_prospect RECORD;
BEGIN
    -- 取得洽談案資料
    SELECT * INTO v_prospect
    FROM prospects
    WHERE id = p_prospect_id AND is_converted = FALSE;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION '洽談案不存在或已轉換';
    END IF;
    
    -- 創建新專案
    INSERT INTO projects (
        project_code,
        client_name,
        project_name,
        amount,
        type,
        payment_template,
        assigned_to,
        origin_prospect_id,
        created_at
    ) VALUES (
        p_project_code,
        v_prospect.client_name,
        v_prospect.project_name,
        v_prospect.estimated_amount,
        p_project_type,
        p_payment_template,
        v_prospect.owner_id,
        p_prospect_id,
        CURRENT_TIMESTAMP
    ) RETURNING id INTO v_project_id;
    
    -- 更新洽談案狀態
    UPDATE prospects
    SET 
        is_converted = TRUE,
        stage = '已轉換',
        converted_to_project_id = v_project_id,
        conversion_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_prospect_id;
    
    -- 記錄活動
    INSERT INTO prospect_activities (
        prospect_id,
        user_id,
        activity_type,
        old_value,
        new_value,
        description
    ) VALUES (
        p_prospect_id,
        auth.uid(),
        'converted_to_project',
        NULL,
        v_project_id::TEXT,
        '洽談案已轉換為專案：' || p_project_code
    );
    
    RETURN v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. 建立視圖：洽談案統計
CREATE OR REPLACE VIEW prospect_statistics AS
SELECT
    COUNT(*) FILTER (WHERE stage = '初談') AS stage_initial,
    COUNT(*) FILTER (WHERE stage = '報價中') AS stage_quoting,
    COUNT(*) FILTER (WHERE stage = '等客戶回覆') AS stage_waiting,
    COUNT(*) FILTER (WHERE stage = '確認簽約') AS stage_confirming,
    COUNT(*) FILTER (WHERE stage = '已失單') AS stage_lost,
    COUNT(*) FILTER (WHERE is_converted = TRUE) AS stage_converted,
    COUNT(*) AS total_prospects,
    SUM(estimated_amount) FILTER (WHERE stage NOT IN ('已失單', '已轉換')) AS total_pipeline_value,
    SUM(estimated_amount * commission_rate / 100) FILTER (WHERE stage NOT IN ('已失單', '已轉換')) AS total_estimated_commission,
    AVG(EXTRACT(DAY FROM (conversion_date - created_at))) FILTER (WHERE is_converted = TRUE) AS avg_conversion_days
FROM prospects;

-- 為視圖授權
GRANT SELECT ON prospect_statistics TO authenticated;

-- 9. 建立視圖：個人洽談案統計
CREATE OR REPLACE VIEW my_prospect_statistics AS
SELECT
    u.id AS user_id,
    u.name AS user_name,
    COUNT(p.id) AS total_prospects,
    COUNT(*) FILTER (WHERE p.is_converted = TRUE) AS converted_count,
    COUNT(*) FILTER (WHERE p.stage = '已失單') AS lost_count,
    SUM(p.estimated_amount) FILTER (WHERE p.stage NOT IN ('已失單', '已轉換')) AS pipeline_value,
    SUM(p.estimated_amount * p.commission_rate / 100) FILTER (WHERE p.stage NOT IN ('已失單', '已轉換')) AS estimated_commission,
    CASE 
        WHEN COUNT(p.id) > 0 
        THEN ROUND((COUNT(*) FILTER (WHERE p.is_converted = TRUE)::NUMERIC / COUNT(p.id)::NUMERIC * 100), 2)
        ELSE 0
    END AS conversion_rate
FROM users u
LEFT JOIN prospects p ON p.owner_id = u.id
WHERE u.role IN ('sales', 'leader')
GROUP BY u.id, u.name;

-- 為視圖授權
GRANT SELECT ON my_prospect_statistics TO authenticated;

-- 完成訊息
DO $$
BEGIN
    RAISE NOTICE '未成案專案管理（Sales Pipeline）資料表建立完成';
    RAISE NOTICE '- prospects 表已建立';
    RAISE NOTICE '- projects 表已增加 origin_prospect_id 欄位';
    RAISE NOTICE '- prospect_activities 表已建立';
    RAISE NOTICE '- 相關索引、觸發器、RLS政策已設定';
    RAISE NOTICE '- 轉換函數 convert_prospect_to_project 已建立';
    RAISE NOTICE '- 統計視圖已建立';
END $$;