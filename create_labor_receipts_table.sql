-- 創建勞務報酬單表

CREATE TABLE IF NOT EXISTS labor_receipts (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    commission_id INTEGER REFERENCES commissions(id) ON DELETE CASCADE,
    
    -- 勞務報酬單資訊
    receipt_number VARCHAR(50) UNIQUE NOT NULL, -- 自動產生的單號
    receipt_date DATE NOT NULL,
    period_start DATE, -- 勞務提供期間開始
    period_end DATE,   -- 勞務提供期間結束
    
    -- 金額資訊
    gross_amount DECIMAL(10, 2) NOT NULL, -- 總額
    tax_amount DECIMAL(10, 2) DEFAULT 0,  -- 扣繳稅額 (10%)
    insurance_amount DECIMAL(10, 2) DEFAULT 0, -- 二代健保費 (2.11%)
    net_amount DECIMAL(10, 2) NOT NULL,   -- 實際發放金額
    
    -- 專案資訊
    project_name TEXT,
    project_code VARCHAR(100),
    client_name VARCHAR(255),
    
    -- 受領人資訊
    recipient_name VARCHAR(255) NOT NULL,
    recipient_id VARCHAR(50), -- 身分證字號
    recipient_address TEXT,
    
    -- 狀態
    status VARCHAR(50) DEFAULT 'draft', -- draft, issued, paid
    
    -- 時間戳記
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    issued_at TIMESTAMP,
    paid_at TIMESTAMP,
    
    -- 備註
    notes TEXT
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_labor_receipts_project_id ON labor_receipts(project_id);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_user_id ON labor_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_commission_id ON labor_receipts(commission_id);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_receipt_number ON labor_receipts(receipt_number);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_status ON labor_receipts(status);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_receipt_date ON labor_receipts(receipt_date);

-- 建立自動產生單號的函數
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TEXT AS $$
DECLARE
    current_year TEXT;
    current_month TEXT;
    next_seq INTEGER;
    receipt_num TEXT;
BEGIN
    current_year := TO_CHAR(CURRENT_DATE, 'YYYY');
    current_month := TO_CHAR(CURRENT_DATE, 'MM');
    
    -- 取得當月的下一個序號
    SELECT COALESCE(MAX(
        CASE 
            WHEN receipt_number ~ ('^LR' || current_year || current_month || '[0-9]+$')
            THEN CAST(SUBSTRING(receipt_number FROM LENGTH('LR' || current_year || current_month) + 1) AS INTEGER)
            ELSE 0
        END
    ), 0) + 1
    INTO next_seq
    FROM labor_receipts;
    
    receipt_num := 'LR' || current_year || current_month || LPAD(next_seq::TEXT, 3, '0');
    
    RETURN receipt_num;
END;
$$ LANGUAGE plpgsql;

-- 建立觸發器自動產生單號
CREATE OR REPLACE FUNCTION set_receipt_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.receipt_number IS NULL OR NEW.receipt_number = '' THEN
        NEW.receipt_number := generate_receipt_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_receipt_number
    BEFORE INSERT ON labor_receipts
    FOR EACH ROW
    EXECUTE FUNCTION set_receipt_number();

-- 檢查結果
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'labor_receipts' 
ORDER BY ordinal_position;