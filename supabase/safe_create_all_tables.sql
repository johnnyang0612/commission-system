-- 安全創建所有必要的表（檢查是否存在）
-- 可以重複執行而不會出錯

-- ============================================
-- 1. 擴展用戶表（添加新欄位）
-- ============================================
-- 檢查並添加缺少的欄位
DO $$ 
BEGIN
  -- 基本資訊
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone_number') THEN
    ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'mobile_number') THEN
    ALTER TABLE users ADD COLUMN mobile_number VARCHAR(20);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'extension') THEN
    ALTER TABLE users ADD COLUMN extension VARCHAR(10);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'job_title') THEN
    ALTER TABLE users ADD COLUMN job_title VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'department') THEN
    ALTER TABLE users ADD COLUMN department VARCHAR(100);
  END IF;
  
  -- 身分資訊
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'national_id') THEN
    ALTER TABLE users ADD COLUMN national_id VARCHAR(20);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'birth_date') THEN
    ALTER TABLE users ADD COLUMN birth_date DATE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'registered_address') THEN
    ALTER TABLE users ADD COLUMN registered_address TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'mailing_address') THEN
    ALTER TABLE users ADD COLUMN mailing_address TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tax_id_number') THEN
    ALTER TABLE users ADD COLUMN tax_id_number VARCHAR(20);
  END IF;
  
  -- 銀行資訊
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bank_name') THEN
    ALTER TABLE users ADD COLUMN bank_name VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bank_code') THEN
    ALTER TABLE users ADD COLUMN bank_code VARCHAR(20);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account_number') THEN
    ALTER TABLE users ADD COLUMN account_number VARCHAR(50);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account_name') THEN
    ALTER TABLE users ADD COLUMN account_name VARCHAR(100);
  END IF;
  
  -- 緊急聯絡
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'emergency_contact_name') THEN
    ALTER TABLE users ADD COLUMN emergency_contact_name VARCHAR(100);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'emergency_contact_phone') THEN
    ALTER TABLE users ADD COLUMN emergency_contact_phone VARCHAR(20);
  END IF;
  
  -- 勞務報酬相關
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tax_exemption_amount') THEN
    ALTER TABLE users ADD COLUMN tax_exemption_amount DECIMAL(10,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'withholding_tax_rate') THEN
    ALTER TABLE users ADD COLUMN withholding_tax_rate DECIMAL(5,2) DEFAULT 10.00;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'health_insurance_fee') THEN
    ALTER TABLE users ADD COLUMN health_insurance_fee DECIMAL(10,2) DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'labor_insurance_fee') THEN
    ALTER TABLE users ADD COLUMN labor_insurance_fee DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- ============================================
-- 2. 創建專案文件表（如果不存在）
-- ============================================
CREATE TABLE IF NOT EXISTS project_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL,
  document_name VARCHAR(200) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  file_type VARCHAR(100),
  public_url TEXT,
  bucket_name VARCHAR(50) DEFAULT 'documents',
  
  -- 版本控制
  version_number INTEGER DEFAULT 1,
  parent_document_id UUID REFERENCES project_documents(id),
  is_current_version BOOLEAN DEFAULT true,
  version_notes TEXT,
  
  -- 文件狀態
  document_status VARCHAR(50) DEFAULT 'draft',
  approval_date DATE,
  approved_by VARCHAR(255),
  
  -- 重要性和標籤
  is_important BOOLEAN DEFAULT false,
  tags TEXT[],
  description TEXT,
  
  -- 時間戳記
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  
  -- 存取控制
  is_confidential BOOLEAN DEFAULT false,
  access_level VARCHAR(20) DEFAULT 'normal'
);

-- 創建文件歷史表
CREATE TABLE IF NOT EXISTS project_document_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES project_documents(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  change_reason TEXT,
  changed_by VARCHAR(255),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. 創建發票管理表（如果不存在）
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  invoice_type VARCHAR(20) NOT NULL, -- 'income' or 'expense'
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  vendor_name VARCHAR(200),
  vendor_tax_id VARCHAR(20),
  
  -- 金額資訊
  subtotal DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  
  -- 付款資訊
  payment_status VARCHAR(20) DEFAULT 'pending',
  payment_date DATE,
  payment_method VARCHAR(50),
  
  -- 檔案資訊
  file_url TEXT,
  file_name VARCHAR(255),
  
  -- 備註
  description TEXT,
  notes TEXT,
  
  -- 時間戳記
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255)
);

-- 創建發票項目表
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  item_description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 5.00,
  notes TEXT
);

-- ============================================
-- 4. 創建索引（如果不存在）
-- ============================================
-- 專案文件索引
CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_type ON project_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_project_documents_status ON project_documents(document_status);
CREATE INDEX IF NOT EXISTS idx_project_documents_version ON project_documents(version_number);
CREATE INDEX IF NOT EXISTS idx_project_documents_current ON project_documents(is_current_version);

-- 發票索引
CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- ============================================
-- 5. 設置 RLS 政策（如果需要）
-- ============================================
-- 啟用 RLS
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_document_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

-- 創建政策（允許所有已登入用戶讀寫）
DO $$ 
BEGIN
  -- Project Documents
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_documents' AND policyname = 'Enable all for authenticated users') THEN
    CREATE POLICY "Enable all for authenticated users" ON project_documents
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
  
  -- Document History
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_document_history' AND policyname = 'Enable all for authenticated users') THEN
    CREATE POLICY "Enable all for authenticated users" ON project_document_history
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
  
  -- Invoices
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'Enable all for authenticated users') THEN
    CREATE POLICY "Enable all for authenticated users" ON invoices
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
  
  -- Invoice Items
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoice_items' AND policyname = 'Enable all for authenticated users') THEN
    CREATE POLICY "Enable all for authenticated users" ON invoice_items
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- 6. 成功訊息
-- ============================================
SELECT '✅ 所有表格已成功創建或更新！' as result;