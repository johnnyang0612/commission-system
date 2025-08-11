-- 為專案成本表和期數表添加單據/發票管理欄位

-- 擴充 project_costs 表，添加發票/單據管理欄位
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100); -- 發票號碼
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS invoice_date DATE; -- 發票日期
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS vendor_name VARCHAR(200); -- 供應商名稱
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS vendor_tax_id VARCHAR(20); -- 供應商統一編號
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS receipt_type VARCHAR(50) DEFAULT 'invoice'; -- 單據類型：invoice(發票), receipt(收據), other(其他)
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS document_status VARCHAR(50) DEFAULT 'pending'; -- 單據狀態：pending(待收), received(已收), filed(已歸檔)
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0; -- 稅額
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS net_amount DECIMAL(10,2) DEFAULT 0; -- 淨額（不含稅）
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS file_path TEXT; -- 單據掃描檔路徑（如果有的話）
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'pending'; -- 審核狀態：pending(待審核), approved(已核准), rejected(已駁回)
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255); -- 核准人
ALTER TABLE project_costs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP; -- 核准時間

-- 擴充 project_installments 表，添加付款單據管理欄位
ALTER TABLE project_installments ADD COLUMN IF NOT EXISTS payment_invoice_number VARCHAR(100); -- 付款發票號碼
ALTER TABLE project_installments ADD COLUMN IF NOT EXISTS payment_receipt_type VARCHAR(50) DEFAULT 'invoice'; -- 收款單據類型
ALTER TABLE project_installments ADD COLUMN IF NOT EXISTS client_company_name VARCHAR(200); -- 客戶公司名稱
ALTER TABLE project_installments ADD COLUMN IF NOT EXISTS client_tax_id VARCHAR(20); -- 客戶統一編號
ALTER TABLE project_installments ADD COLUMN IF NOT EXISTS payment_tax_amount DECIMAL(10,2) DEFAULT 0; -- 收款稅額
ALTER TABLE project_installments ADD COLUMN IF NOT EXISTS payment_net_amount DECIMAL(10,2) DEFAULT 0; -- 收款淨額（不含稅）
ALTER TABLE project_installments ADD COLUMN IF NOT EXISTS payment_file_path TEXT; -- 收款單據掃描檔路徑

-- 創建單據管理相關的索引
CREATE INDEX IF NOT EXISTS idx_project_costs_invoice_number ON project_costs(invoice_number);
CREATE INDEX IF NOT EXISTS idx_project_costs_vendor_name ON project_costs(vendor_name);
CREATE INDEX IF NOT EXISTS idx_project_costs_document_status ON project_costs(document_status);
CREATE INDEX IF NOT EXISTS idx_project_costs_approval_status ON project_costs(approval_status);
CREATE INDEX IF NOT EXISTS idx_project_installments_payment_invoice ON project_installments(payment_invoice_number);

-- 更新現有資料的預設值
UPDATE project_costs SET 
  net_amount = amount,
  document_status = 'pending',
  approval_status = 'pending'
WHERE net_amount IS NULL OR net_amount = 0;

UPDATE project_installments SET 
  payment_net_amount = amount
WHERE payment_net_amount IS NULL OR payment_net_amount = 0;

-- 創建單據類型枚舉（註解，實際使用 VARCHAR 以保持彈性）
-- receipt_type: 'invoice' (統一發票), 'receipt' (收據), 'other' (其他單據)
-- document_status: 'pending' (待收單據), 'received' (已收到), 'filed' (已歸檔)
-- approval_status: 'pending' (待審核), 'approved' (已核准), 'rejected' (已駁回)