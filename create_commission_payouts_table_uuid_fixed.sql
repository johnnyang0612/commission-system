-- 創建分潤撥款記錄表（支援分期撥款）- UUID版本 (修復版)

-- 先刪除舊的視圖（如果存在）
DROP VIEW IF EXISTS commission_summary;

-- 創建表（如果不存在）
CREATE TABLE IF NOT EXISTS commission_payouts (
    id SERIAL PRIMARY KEY,
    commission_id UUID REFERENCES commissions(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- 撥款資訊
    payout_date DATE NOT NULL,
    payout_amount DECIMAL(10, 2) NOT NULL, -- 本次撥款金額
    payment_basis DECIMAL(10, 2) NOT NULL, -- 對應的客戶付款金額
    payout_ratio DECIMAL(5, 4) NOT NULL,   -- 撥款比例 (0.0000-1.0000)
    
    -- 關聯的客戶付款
    related_payment_id UUID REFERENCES payments(id),
    
    -- 勞務報酬單
    labor_receipt_id INTEGER REFERENCES labor_receipts(id),
    
    -- 狀態
    status VARCHAR(50) DEFAULT 'paid', -- paid, cancelled
    
    -- 備註
    notes TEXT,
    
    -- 時間戳記
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_commission_payouts_commission_id ON commission_payouts(commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_project_id ON commission_payouts(project_id);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_user_id ON commission_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_payout_date ON commission_payouts(payout_date);
CREATE INDEX IF NOT EXISTS idx_commission_payouts_status ON commission_payouts(status);

-- 創建視圖：分潤總覽（包含已撥款統計）- 修復版
-- 只選擇必要的欄位，避免重複
CREATE OR REPLACE VIEW commission_summary AS
SELECT 
    c.id,
    c.project_id,
    c.user_id,
    c.percentage,
    c.amount,
    c.status,
    c.created_at,
    c.updated_at,
    c.labor_receipt_generated,
    c.labor_receipt_id,
    -- 計算欄位
    COALESCE(SUM(cp.payout_amount), 0)::DECIMAL(10,2) as total_paid_amount,
    COALESCE(COUNT(cp.id), 0)::INTEGER as payout_count,
    (c.amount - COALESCE(SUM(cp.payout_amount), 0))::DECIMAL(10,2) as remaining_amount,
    CASE 
        WHEN c.amount > 0 THEN (COALESCE(SUM(cp.payout_amount), 0) / c.amount * 100)::DECIMAL(5,2)
        ELSE 0 
    END as paid_percentage
FROM commissions c
LEFT JOIN commission_payouts cp ON c.id = cp.commission_id AND cp.status = 'paid'
GROUP BY 
    c.id,
    c.project_id,
    c.user_id,
    c.percentage,
    c.amount,
    c.status,
    c.created_at,
    c.updated_at,
    c.labor_receipt_generated,
    c.labor_receipt_id;

-- 檢查結果
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'commission_payouts' 
ORDER BY ordinal_position;