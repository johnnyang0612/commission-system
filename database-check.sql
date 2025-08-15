-- 戰情室功能資料庫結構檢查和創建腳本
-- 請在Supabase SQL編輯器中執行

-- 1. 檢查並創建prospects表格（如果不存在）
-- 注意：如果表格已存在，請使用 database-migration.sql 來添加新欄位
CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_name VARCHAR NOT NULL,
  project_name VARCHAR,
  stage VARCHAR DEFAULT '初談',
  close_rate VARCHAR DEFAULT 'medium', -- high, medium, low
  budget_status VARCHAR DEFAULT 'sufficient', -- sufficient, insufficient, too_low
  estimated_amount DECIMAL(15,2),
  contract_date DATE,
  next_followup_date DATE,
  expected_sign_date DATE,
  assignee VARCHAR,
  owner_id UUID,
  pain_points TEXT[],
  competitors TEXT[],
  resistance_factors TEXT[],
  decision_makers JSONB DEFAULT '[]'::jsonb,
  decision_maker_name VARCHAR,
  decision_maker_position VARCHAR,
  decision_maker_contact VARCHAR,
  key_influencers TEXT,
  main_pain_points TEXT,
  close_obstacles TEXT,
  competitor_name VARCHAR,
  competitor_status VARCHAR DEFAULT 'none',
  payment_terms VARCHAR,
  profit_sharing_method VARCHAR,
  profit_sharing_ratio DECIMAL(5,2),
  current_status TEXT,
  source VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 檢查並創建prospect_actions表格（行動追蹤）
CREATE TABLE IF NOT EXISTS prospect_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  action_type VARCHAR NOT NULL, -- phone, meeting, presentation, quote, send_materials, sample
  action_content TEXT NOT NULL,
  action_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  next_follow_date DATE,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_by VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 檢查並創建assistance_requests表格（協助請求）
CREATE TABLE IF NOT EXISTS assistance_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  requester VARCHAR NOT NULL,
  supervisor VARCHAR NOT NULL,
  assistance_type VARCHAR NOT NULL,
  priority VARCHAR DEFAULT 'medium', -- urgent, high, medium, low
  description TEXT NOT NULL,
  status VARCHAR DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  response TEXT
);

-- 4. 檢查並創建shared_files表格（檔案分享）
CREATE TABLE IF NOT EXISTS shared_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name VARCHAR NOT NULL,
  file_path VARCHAR NOT NULL,
  file_size INTEGER,
  file_type VARCHAR,
  uploaded_by VARCHAR NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  description TEXT,
  tags TEXT[],
  is_active BOOLEAN DEFAULT true
);

-- 5. 檢查並創建prospect_statistics表格（統計資料）
CREATE TABLE IF NOT EXISTS prospect_statistics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  total_prospects INTEGER DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  high_close_rate_count INTEGER DEFAULT 0,
  medium_close_rate_count INTEGER DEFAULT 0,
  low_close_rate_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 創建索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_prospects_close_rate ON prospects(close_rate);
CREATE INDEX IF NOT EXISTS idx_prospects_next_follow_date ON prospects(next_follow_date);
CREATE INDEX IF NOT EXISTS idx_prospects_estimated_amount ON prospects(estimated_amount);
CREATE INDEX IF NOT EXISTS idx_prospects_assignee ON prospects(assignee);
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospect_actions_prospect_id ON prospect_actions(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_actions_date ON prospect_actions(action_date);
CREATE INDEX IF NOT EXISTS idx_assistance_requests_prospect_id ON assistance_requests(prospect_id);
CREATE INDEX IF NOT EXISTS idx_assistance_requests_supervisor ON assistance_requests(supervisor);
CREATE INDEX IF NOT EXISTS idx_assistance_requests_status ON assistance_requests(status);

-- 7. 創建更新統計資料的函數
CREATE OR REPLACE FUNCTION update_prospect_statistics()
RETURNS TRIGGER AS $$
BEGIN
  -- 更新統計表格
  INSERT INTO prospect_statistics (id, total_prospects, total_amount, high_close_rate_count, medium_close_rate_count, low_close_rate_count, updated_at)
  VALUES (
    uuid_generate_v4(),
    (SELECT COUNT(*) FROM prospects WHERE stage NOT IN ('已失單', '已轉換')),
    (SELECT COALESCE(SUM(estimated_amount), 0) FROM prospects WHERE stage NOT IN ('已失單', '已轉換')),
    (SELECT COUNT(*) FROM prospects WHERE close_rate = 'high' AND stage NOT IN ('已失單', '已轉換')),
    (SELECT COUNT(*) FROM prospects WHERE close_rate = 'medium' AND stage NOT IN ('已失單', '已轉換')),
    (SELECT COUNT(*) FROM prospects WHERE close_rate = 'low' AND stage NOT IN ('已失單', '已轉換')),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    total_prospects = EXCLUDED.total_prospects,
    total_amount = EXCLUDED.total_amount,
    high_close_rate_count = EXCLUDED.high_close_rate_count,
    medium_close_rate_count = EXCLUDED.medium_close_rate_count,
    low_close_rate_count = EXCLUDED.low_close_rate_count,
    updated_at = EXCLUDED.updated_at;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 8. 創建觸發器
DROP TRIGGER IF EXISTS trigger_update_prospect_statistics ON prospects;
CREATE TRIGGER trigger_update_prospect_statistics
  AFTER INSERT OR UPDATE OR DELETE ON prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_prospect_statistics();

-- 9. 插入測試資料（如果表格為空）
INSERT INTO prospects (client_name, project_name, stage, close_rate, budget_status, estimated_amount, contract_date, next_follow_date, assignee, current_status)
SELECT * FROM (VALUES
  ('台積電', 'ERP系統升級', '談判', 'high', 'sufficient', 2500000, '2025-09-15', '2025-08-18', '張業務', '等待最終報價核准'),
  ('鴻海', '智慧工廠解決方案', '報價', 'high', 'insufficient', 1800000, '2025-09-30', '2025-08-20', '李業務', '客戶要求降價10%'),
  ('華碩', '資安防護系統', '提案', 'medium', 'sufficient', 950000, '2025-10-10', '2025-08-17', '王業務', '技術團隊評估中'),
  ('宏達電', '行動應用開發', '初談', 'medium', 'too_low', 650000, '2025-11-01', '2025-08-22', '陳業務', '預算需要重新評估'),
  ('聯發科', '晶片測試系統', '待簽約', 'high', 'sufficient', 3200000, '2025-08-25', '2025-08-16', '張業務', '合約條款最終確認'),
  ('廣達', '雲端遷移專案', '談判', 'medium', 'sufficient', 1200000, '2025-09-20', '2025-08-19', '李業務', '討論分期付款方案'),
  ('和碩', '數位轉型顧問', '初談', 'low', 'insufficient', 800000, '2025-12-01', '2025-08-25', '王業務', '需要更多功能展示'),
  ('緯創', '供應鏈管理系統', '提案', 'high', 'sufficient', 1600000, '2025-10-05', '2025-08-21', '陳業務', '等待董事會決議')
) AS t(client_name, project_name, stage, close_rate, budget_status, estimated_amount, contract_date, next_follow_date, assignee, current_status)
WHERE NOT EXISTS (SELECT 1 FROM prospects LIMIT 1);

-- 10. 插入測試行動追蹤資料
INSERT INTO prospect_actions (prospect_id, action_type, action_content, action_date, next_follow_date, created_by)
SELECT 
  p.id,
  'phone',
  '與' || p.client_name || '進行初步需求確認電話',
  NOW() - INTERVAL '1 day',
  p.next_follow_date,
  p.assignee
FROM prospects p
WHERE NOT EXISTS (SELECT 1 FROM prospect_actions WHERE prospect_id = p.id)
LIMIT 3;

-- 11. 插入測試協助請求資料
INSERT INTO assistance_requests (prospect_id, requester, supervisor, assistance_type, priority, description)
SELECT 
  p.id,
  p.assignee,
  '王主管',
  'review_quote',
  'high',
  '請協助審核' || p.client_name || '的報價單，金額較大需要主管核准'
FROM prospects p
WHERE p.estimated_amount > 2000000
AND NOT EXISTS (SELECT 1 FROM assistance_requests WHERE prospect_id = p.id)
LIMIT 2;

-- 12. 插入測試共享檔案資料
INSERT INTO shared_files (file_name, file_path, uploaded_by, description, tags)
SELECT * FROM (VALUES
  ('產品手冊_2025.pdf', '/files/product_manual_2025.pdf', '王主管', '最新產品功能介紹手冊', ARRAY['產品', '手冊', '2025']),
  ('價格表_企業版.xlsx', '/files/enterprise_pricing.xlsx', '李主管', '企業版產品價格表', ARRAY['價格', '企業版']),
  ('技術規格書.docx', '/files/technical_specs.docx', '張主管', '技術規格詳細說明', ARRAY['技術', '規格']),
  ('案例分析_成功故事.pptx', '/files/success_stories.pptx', '王主管', '客戶成功案例分析', ARRAY['案例', '成功故事'])
) AS t(file_name, file_path, uploaded_by, description, tags)
WHERE NOT EXISTS (SELECT 1 FROM shared_files LIMIT 1);

-- 13. 創建RLS (Row Level Security) 政策（如需要）
-- ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE prospect_actions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE assistance_requests ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE shared_files ENABLE ROW LEVEL SECURITY;

COMMIT;

-- 14. 驗證資料
SELECT '資料庫檢查完成' as message;
SELECT 'prospects表格記錄數:' as info, COUNT(*) as count FROM prospects;
SELECT 'prospect_actions表格記錄數:' as info, COUNT(*) as count FROM prospect_actions;
SELECT 'assistance_requests表格記錄數:' as info, COUNT(*) as count FROM assistance_requests;
SELECT 'shared_files表格記錄數:' as info, COUNT(*) as count FROM shared_files;