-- 戰情室資料庫快速修復腳本
-- 解決 "column close_rate does not exist" 和 UUID 類型錯誤
-- 請在Supabase SQL編輯器中執行

-- =====================================================
-- 步驟1: 為現有prospects表格添加戰情室欄位
-- =====================================================

DO $$
BEGIN
    -- 添加成交率欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='close_rate') THEN
        ALTER TABLE prospects ADD COLUMN close_rate VARCHAR DEFAULT 'medium';
        RAISE NOTICE '✅ close_rate 欄位已添加';
    END IF;
    
    -- 添加預算狀態欄位  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='budget_status') THEN
        ALTER TABLE prospects ADD COLUMN budget_status VARCHAR DEFAULT 'sufficient';
        RAISE NOTICE '✅ budget_status 欄位已添加';
    END IF;
    
    -- 添加下次追蹤日期欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='next_followup_date') THEN
        ALTER TABLE prospects ADD COLUMN next_followup_date DATE;
        RAISE NOTICE '✅ next_followup_date 欄位已添加';
    END IF;
    
    -- 添加預期簽約日期欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='expected_sign_date') THEN
        ALTER TABLE prospects ADD COLUMN expected_sign_date DATE;
        RAISE NOTICE '✅ expected_sign_date 欄位已添加';
    END IF;
    
    -- 添加owner_id欄位（如果不存在）
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='owner_id') THEN
        ALTER TABLE prospects ADD COLUMN owner_id UUID;
        RAISE NOTICE '✅ owner_id 欄位已添加';
    END IF;
    
    -- 添加決策人相關欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='decision_maker_name') THEN
        ALTER TABLE prospects ADD COLUMN decision_maker_name VARCHAR;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='decision_maker_position') THEN
        ALTER TABLE prospects ADD COLUMN decision_maker_position VARCHAR;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='decision_maker_contact') THEN
        ALTER TABLE prospects ADD COLUMN decision_maker_contact VARCHAR;
    END IF;
    
    -- 添加其他戰情室欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='key_influencers') THEN
        ALTER TABLE prospects ADD COLUMN key_influencers TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='main_pain_points') THEN
        ALTER TABLE prospects ADD COLUMN main_pain_points TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='close_obstacles') THEN
        ALTER TABLE prospects ADD COLUMN close_obstacles TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='competitor_name') THEN
        ALTER TABLE prospects ADD COLUMN competitor_name VARCHAR;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='competitor_status') THEN
        ALTER TABLE prospects ADD COLUMN competitor_status VARCHAR DEFAULT 'none';
    END IF;
    
    RAISE NOTICE '✅ 所有戰情室欄位添加完成';
END $$;

-- =====================================================
-- 步驟2: 更新現有記錄的預設值
-- =====================================================

UPDATE prospects 
SET 
  close_rate = COALESCE(close_rate, 'medium'),
  budget_status = COALESCE(budget_status, 'sufficient'),
  competitor_status = COALESCE(competitor_status, 'none')
WHERE close_rate IS NULL OR budget_status IS NULL OR competitor_status IS NULL;

-- =====================================================
-- 步驟3: 創建戰情室相關表格（安全創建，不影響現有表格）
-- =====================================================

-- 創建使用者表格（如果不存在）
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  role VARCHAR DEFAULT 'sales',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建行動記錄表格
CREATE TABLE IF NOT EXISTS action_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  user_id UUID,
  action_type VARCHAR NOT NULL,
  content TEXT NOT NULL,
  action_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  next_followup_date DATE,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建協助請求表格
CREATE TABLE IF NOT EXISTS assistance_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  requester_id UUID,
  supervisor_id UUID,
  type VARCHAR NOT NULL,
  priority VARCHAR DEFAULT 'medium',
  description TEXT NOT NULL,
  deadline DATE,
  status VARCHAR DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  response TEXT
);

-- 創建共享檔案表格
CREATE TABLE IF NOT EXISTS shared_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID,
  uploader_id UUID,
  file_name VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  file_url TEXT,
  file_size INTEGER,
  mime_type VARCHAR,
  description TEXT,
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 步驟4: 創建索引優化效能
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_prospects_close_rate ON prospects(close_rate);
CREATE INDEX IF NOT EXISTS idx_prospects_next_followup_date ON prospects(next_followup_date);
CREATE INDEX IF NOT EXISTS idx_prospects_expected_sign_date ON prospects(expected_sign_date);
CREATE INDEX IF NOT EXISTS idx_prospects_budget_status ON prospects(budget_status);
CREATE INDEX IF NOT EXISTS idx_action_records_prospect_id ON action_records(prospect_id);
CREATE INDEX IF NOT EXISTS idx_assistance_requests_prospect_id ON assistance_requests(prospect_id);
CREATE INDEX IF NOT EXISTS idx_shared_files_prospect_id ON shared_files(prospect_id);

-- =====================================================
-- 步驟5: 插入基本測試使用者（使用安全的UUID生成）
-- =====================================================

INSERT INTO users (email, name, role)
VALUES 
  ('sales1@company.com', '張業務', 'sales'),
  ('sales2@company.com', '李業務', 'sales'),
  ('sales3@company.com', '王業務', 'sales'),
  ('sales4@company.com', '陳業務', 'sales'),
  ('manager1@company.com', '王主管', 'manager'),
  ('manager2@company.com', '李主管', 'manager')
ON CONFLICT (email) DO NOTHING;

-- =====================================================
-- 步驟6: 驗證安裝結果
-- =====================================================

-- 檢查關鍵欄位是否存在
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='close_rate') 
    THEN '✅ close_rate 欄位已存在'
    ELSE '❌ close_rate 欄位不存在'
  END as close_rate_status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='budget_status') 
    THEN '✅ budget_status 欄位已存在'
    ELSE '❌ budget_status 欄位不存在'
  END as budget_status_status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='next_followup_date') 
    THEN '✅ next_followup_date 欄位已存在'
    ELSE '❌ next_followup_date 欄位不存在'
  END as next_followup_date_status;

-- 顯示表格記錄數量
SELECT 
  'prospects' as table_name, 
  COUNT(*) as record_count 
FROM prospects
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'action_records', COUNT(*) FROM action_records
UNION ALL
SELECT 'assistance_requests', COUNT(*) FROM assistance_requests
UNION ALL
SELECT 'shared_files', COUNT(*) FROM shared_files
ORDER BY table_name;

-- =====================================================
-- 完成！
-- =====================================================

SELECT '🎉 戰情室資料庫修復完成！請重新整理頁面。' as message;