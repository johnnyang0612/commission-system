-- 創建維護費現金流管理表
CREATE TABLE IF NOT EXISTS maintenance_cashflow (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  maintenance_fee DECIMAL(12,2) NOT NULL,
  billing_cycle VARCHAR(20) DEFAULT 'monthly', -- monthly, quarterly, yearly
  start_date DATE NOT NULL,
  end_date DATE, -- 維護合約結束日期，NULL表示持續
  next_billing_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'active', -- active, paused, terminated
  auto_generate_bills BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 創建維護費帳單表
CREATE TABLE IF NOT EXISTS maintenance_bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  maintenance_cashflow_id UUID REFERENCES maintenance_cashflow(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  billing_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, paid, overdue, cancelled
  payment_date DATE,
  actual_amount DECIMAL(12,2),
  payment_method VARCHAR(50),
  invoice_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 創建索引
CREATE INDEX IF NOT EXISTS idx_maintenance_cashflow_project_id ON maintenance_cashflow(project_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_cashflow_status ON maintenance_cashflow(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_cashflow_next_billing ON maintenance_cashflow(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_bills_cashflow_id ON maintenance_bills(maintenance_cashflow_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_bills_project_id ON maintenance_bills(project_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_bills_status ON maintenance_bills(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_bills_due_date ON maintenance_bills(due_date);

-- RLS 政策
ALTER TABLE maintenance_cashflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_bills ENABLE ROW LEVEL SECURITY;

-- 允許認證用戶查看和操作
CREATE POLICY "Enable read access for authenticated users" ON maintenance_cashflow FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert access for authenticated users" ON maintenance_cashflow FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update access for authenticated users" ON maintenance_cashflow FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete access for authenticated users" ON maintenance_cashflow FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for authenticated users" ON maintenance_bills FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable insert access for authenticated users" ON maintenance_bills FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update access for authenticated users" ON maintenance_bills FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete access for authenticated users" ON maintenance_bills FOR DELETE USING (auth.role() = 'authenticated');