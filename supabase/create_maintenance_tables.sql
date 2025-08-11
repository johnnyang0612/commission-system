-- 建立維護管理相關資料表

-- 維護費現金流表 (maintenance_cashflow)
CREATE TABLE IF NOT EXISTS maintenance_cashflow (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 維護合約資訊
  maintenance_fee DECIMAL(10,2) NOT NULL, -- 月維護費
  start_date DATE NOT NULL, -- 維護開始日期
  end_date DATE, -- 維護結束日期
  billing_day INTEGER DEFAULT 1, -- 每月計費日 (1-31)
  next_billing_date DATE, -- 下次計費日期
  
  -- 合約狀態
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'paused', 'terminated', 'expired'
  
  -- 提醒設定
  renewal_alert_months INTEGER DEFAULT 2, -- 到期前幾個月提醒 (預設2個月)
  renewal_alert_weeks INTEGER DEFAULT 2, -- 到期前幾週提醒 (預設2週)
  last_alert_sent DATE, -- 最後提醒日期
  
  -- 備註資訊
  notes TEXT,
  contract_number VARCHAR(100), -- 維護合約編號
  
  -- 時間戳記
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);

-- 維護費帳單表 (maintenance_bills)
CREATE TABLE IF NOT EXISTS maintenance_bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  maintenance_cashflow_id UUID REFERENCES maintenance_cashflow(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 帳單資訊
  billing_date DATE NOT NULL, -- 帳單開立日期
  due_date DATE NOT NULL, -- 到期日期
  amount DECIMAL(10,2) NOT NULL, -- 帳單金額
  actual_amount DECIMAL(10,2), -- 實際收款金額
  
  -- 帳單狀態
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'paid', 'overdue', 'cancelled'
  payment_date DATE, -- 實際付款日期
  payment_method VARCHAR(50), -- 付款方式
  
  -- 發票資訊
  invoice_number VARCHAR(100), -- 發票號碼
  invoice_date DATE, -- 發票日期
  
  -- 備註
  notes TEXT,
  
  -- 時間戳記
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255)
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_maintenance_cashflow_project_id ON maintenance_cashflow(project_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_cashflow_status ON maintenance_cashflow(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_cashflow_next_billing ON maintenance_cashflow(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_cashflow_end_date ON maintenance_cashflow(end_date);

CREATE INDEX IF NOT EXISTS idx_maintenance_bills_cashflow_id ON maintenance_bills(maintenance_cashflow_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_bills_project_id ON maintenance_bills(project_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_bills_status ON maintenance_bills(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_bills_due_date ON maintenance_bills(due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_bills_billing_date ON maintenance_bills(billing_date);

-- 建立觸發器，自動更新 updated_at
CREATE OR REPLACE FUNCTION update_maintenance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_maintenance_cashflow_updated_at
  BEFORE UPDATE ON maintenance_cashflow
  FOR EACH ROW
  EXECUTE FUNCTION update_maintenance_updated_at();

-- 建立範例資料 (可選)
-- 這裡可以插入一些測試資料，但在生產環境中應該移除

-- 為現有專案自動建立維護現金流 (如果專案表中有維護資訊)
-- 這個查詢會檢查 projects 表中是否有維護費相關欄位，並自動建立對應記錄
INSERT INTO maintenance_cashflow (
  project_id, 
  maintenance_fee, 
  start_date, 
  end_date,
  next_billing_date,
  status,
  created_by
)
SELECT 
  p.id,
  COALESCE(p.maintenance_fee, 0) as maintenance_fee,
  COALESCE(p.maintenance_start_date, p.created_at::date) as start_date,
  p.maintenance_end_date,
  CASE 
    WHEN p.maintenance_billing_date IS NOT NULL 
    THEN p.maintenance_billing_date
    ELSE (COALESCE(p.maintenance_start_date, p.created_at::date) + INTERVAL '1 month')::date
  END as next_billing_date,
  CASE 
    WHEN p.maintenance_fee > 0 THEN 'active'
    ELSE 'terminated'
  END as status,
  'system_migration'
FROM projects p
WHERE p.maintenance_fee IS NOT NULL 
  AND p.maintenance_fee > 0
  AND NOT EXISTS (
    SELECT 1 FROM maintenance_cashflow mc 
    WHERE mc.project_id = p.id
  );

-- 註解說明
COMMENT ON TABLE maintenance_cashflow IS '維護費現金流表 - 管理每個專案的維護合約和月費';
COMMENT ON TABLE maintenance_bills IS '維護費帳單表 - 管理每月的維護費帳單';

COMMENT ON COLUMN maintenance_cashflow.status IS '合約狀態: active(進行中), paused(暫停), terminated(已終止), expired(已到期)';
COMMENT ON COLUMN maintenance_bills.status IS '帳單狀態: pending(待付款), paid(已付款), overdue(逾期), cancelled(已取消)';
COMMENT ON COLUMN maintenance_cashflow.renewal_alert_months IS '合約到期前幾個月開始提醒續約';
COMMENT ON COLUMN maintenance_cashflow.renewal_alert_weeks IS '合約到期前幾週加強提醒續約';