-- 戰情室功能資料庫遷移腳本
-- 為現有prospects表格添加戰情室需要的新欄位
-- 請在Supabase SQL編輯器中執行

-- 1. 為prospects表格添加戰情室新欄位
DO $$
BEGIN
    -- 添加成交率欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='close_rate') THEN
        ALTER TABLE prospects ADD COLUMN close_rate VARCHAR DEFAULT 'medium';
    END IF;
    
    -- 添加預算狀態欄位  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='budget_status') THEN
        ALTER TABLE prospects ADD COLUMN budget_status VARCHAR DEFAULT 'sufficient';
    END IF;
    
    -- 添加下次追蹤日期欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='next_followup_date') THEN
        ALTER TABLE prospects ADD COLUMN next_followup_date DATE;
    END IF;
    
    -- 添加預期簽約日期欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='expected_sign_date') THEN
        ALTER TABLE prospects ADD COLUMN expected_sign_date DATE;
    END IF;
    
    -- 添加決策人姓名欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='decision_maker_name') THEN
        ALTER TABLE prospects ADD COLUMN decision_maker_name VARCHAR;
    END IF;
    
    -- 添加決策人職位欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='decision_maker_position') THEN
        ALTER TABLE prospects ADD COLUMN decision_maker_position VARCHAR;
    END IF;
    
    -- 添加決策人聯絡方式欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='decision_maker_contact') THEN
        ALTER TABLE prospects ADD COLUMN decision_maker_contact VARCHAR;
    END IF;
    
    -- 添加關鍵影響者欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='key_influencers') THEN
        ALTER TABLE prospects ADD COLUMN key_influencers TEXT;
    END IF;
    
    -- 添加主要痛點欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='main_pain_points') THEN
        ALTER TABLE prospects ADD COLUMN main_pain_points TEXT;
    END IF;
    
    -- 添加成交阻力欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='close_obstacles') THEN
        ALTER TABLE prospects ADD COLUMN close_obstacles TEXT;
    END IF;
    
    -- 添加競爭對手名稱欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='competitor_name') THEN
        ALTER TABLE prospects ADD COLUMN competitor_name VARCHAR;
    END IF;
    
    -- 添加競爭對手狀態欄位
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='competitor_status') THEN
        ALTER TABLE prospects ADD COLUMN competitor_status VARCHAR DEFAULT 'none';
    END IF;
    
    RAISE NOTICE 'prospects表格欄位添加完成';
END $$;

-- 2. 創建行動追蹤表格（如果不存在）
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

-- 3. 創建協助請求表格（如果不存在）
CREATE TABLE IF NOT EXISTS assistance_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL,
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

-- 4. 創建共享檔案表格（如果不存在）
CREATE TABLE IF NOT EXISTS shared_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL,
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

-- 5. 創建使用者表格（如果不存在）
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR UNIQUE NOT NULL,
  name VARCHAR NOT NULL,
  role VARCHAR DEFAULT 'sales',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 創建索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_prospects_close_rate ON prospects(close_rate);
CREATE INDEX IF NOT EXISTS idx_prospects_next_followup_date ON prospects(next_followup_date);
CREATE INDEX IF NOT EXISTS idx_prospects_expected_sign_date ON prospects(expected_sign_date);
CREATE INDEX IF NOT EXISTS idx_prospects_estimated_amount ON prospects(estimated_amount);
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_updated_at ON prospects(updated_at);

CREATE INDEX IF NOT EXISTS idx_action_records_prospect_id ON action_records(prospect_id);
CREATE INDEX IF NOT EXISTS idx_action_records_action_date ON action_records(action_date);

CREATE INDEX IF NOT EXISTS idx_assistance_requests_prospect_id ON assistance_requests(prospect_id);
CREATE INDEX IF NOT EXISTS idx_assistance_requests_status ON assistance_requests(status);

CREATE INDEX IF NOT EXISTS idx_shared_files_prospect_id ON shared_files(prospect_id);
CREATE INDEX IF NOT EXISTS idx_shared_files_uploader_id ON shared_files(uploader_id);

-- 7. 更新現有資料的預設值
UPDATE prospects 
SET 
  close_rate = COALESCE(close_rate, 'medium'),
  budget_status = COALESCE(budget_status, 'sufficient'),
  competitor_status = COALESCE(competitor_status, 'none')
WHERE close_rate IS NULL OR budget_status IS NULL OR competitor_status IS NULL;

-- 8. 插入測試使用者資料（如果不存在）
INSERT INTO users (id, email, name, role)
SELECT * FROM (VALUES
  ('00000000-0000-0000-0000-000000000001', 'zhang@chuanhui.com', '張業務', 'sales'),
  ('00000000-0000-0000-0000-000000000002', 'li@chuanhui.com', '李業務', 'sales'),
  ('00000000-0000-0000-0000-000000000003', 'wang@chuanhui.com', '王業務', 'sales'),
  ('00000000-0000-0000-0000-000000000004', 'chen@chuanhui.com', '陳業務', 'sales'),
  ('00000000-0000-0000-0000-000000000005', 'wang.manager@chuanhui.com', '王主管', 'manager'),
  ('00000000-0000-0000-0000-000000000006', 'li.manager@chuanhui.com', '李主管', 'manager'),
  ('00000000-0000-0000-0000-000000000007', 'zhang.manager@chuanhui.com', '張主管', 'manager')
) AS t(id, email, name, role)
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = t.email);

-- 9. 更新現有prospects資料，添加owner_id關聯
DO $$
BEGIN
    -- 如果owner_id欄位不存在，先添加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='owner_id') THEN
        ALTER TABLE prospects ADD COLUMN owner_id UUID REFERENCES users(id);
    END IF;
    
    -- 根據assignee欄位更新owner_id
    UPDATE prospects 
    SET owner_id = users.id 
    FROM users 
    WHERE prospects.assignee = users.name 
    AND prospects.owner_id IS NULL;
END $$;

-- 10. 插入測試行動記錄（如果表格為空）
INSERT INTO action_records (prospect_id, user_id, action_type, content, action_date)
SELECT 
  p.id,
  p.owner_id,
  'phone',
  '與' || p.client_name || '進行初步需求確認電話',
  NOW() - INTERVAL '1 day'
FROM prospects p
WHERE p.owner_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM action_records WHERE prospect_id = p.id)
LIMIT 3;

-- 11. 插入測試協助請求（如果表格為空）
INSERT INTO assistance_requests (prospect_id, requester_id, supervisor_id, type, priority, description)
SELECT 
  p.id,
  p.owner_id,
  '00000000-0000-0000-0000-000000000005'::uuid, -- 王主管
  'review_quote',
  'high',
  '請協助審核' || p.client_name || '的報價單，金額較大需要主管核准'
FROM prospects p
WHERE p.estimated_amount > 2000000
AND p.owner_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM assistance_requests WHERE prospect_id = p.id)
LIMIT 2;

-- 12. 插入測試共享檔案（如果表格為空）
INSERT INTO shared_files (uploader_id, file_name, file_path, file_url, description, tags)
SELECT * FROM (VALUES
  ('00000000-0000-0000-0000-000000000005', '產品手冊_2025.pdf', '/files/product_manual_2025.pdf', 'https://example.com/files/product_manual_2025.pdf', '最新產品功能介紹手冊', ARRAY['產品', '手冊', '2025']),
  ('00000000-0000-0000-0000-000000000006', '價格表_企業版.xlsx', '/files/enterprise_pricing.xlsx', 'https://example.com/files/enterprise_pricing.xlsx', '企業版產品價格表', ARRAY['價格', '企業版']),
  ('00000000-0000-0000-0000-000000000007', '技術規格書.docx', '/files/technical_specs.docx', 'https://example.com/files/technical_specs.docx', '技術規格詳細說明', ARRAY['技術', '規格']),
  ('00000000-0000-0000-0000-000000000005', '案例分析_成功故事.pptx', '/files/success_stories.pptx', 'https://example.com/files/success_stories.pptx', '客戶成功案例分析', ARRAY['案例', '成功故事'])
) AS t(uploader_id, file_name, file_path, file_url, description, tags)
WHERE NOT EXISTS (SELECT 1 FROM shared_files LIMIT 1);

COMMIT;

-- 13. 驗證遷移結果
SELECT 
  'prospects表格欄位檢查' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'prospects' 
AND column_name IN ('close_rate', 'budget_status', 'next_followup_date', 'expected_sign_date', 'decision_maker_name')
ORDER BY column_name;

SELECT 'prospects記錄數:' as info, COUNT(*) as count FROM prospects;
SELECT 'action_records記錄數:' as info, COUNT(*) as count FROM action_records;
SELECT 'assistance_requests記錄數:' as info, COUNT(*) as count FROM assistance_requests;
SELECT 'shared_files記錄數:' as info, COUNT(*) as count FROM shared_files;
SELECT 'users記錄數:' as info, COUNT(*) as count FROM users;

SELECT '資料庫遷移完成！' as message;