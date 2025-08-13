-- 更新 commissions 表以支援勞務報酬單功能

-- 添加新欄位
ALTER TABLE commissions 
ADD COLUMN IF NOT EXISTS paid_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS labor_receipt_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS labor_receipt_id INTEGER REFERENCES labor_receipts(id),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_commissions_paid_date ON commissions(paid_date);
CREATE INDEX IF NOT EXISTS idx_commissions_labor_receipt_generated ON commissions(labor_receipt_generated);
CREATE INDEX IF NOT EXISTS idx_commissions_labor_receipt_id ON commissions(labor_receipt_id);
CREATE INDEX IF NOT EXISTS idx_commissions_updated_at ON commissions(updated_at);

-- 檢查結果
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'commissions' 
AND column_name IN ('paid_date', 'labor_receipt_generated', 'labor_receipt_id', 'updated_at')
ORDER BY column_name;