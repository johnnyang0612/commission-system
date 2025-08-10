-- 建立詳細的分批撥款和收款追蹤系統
-- Execute this in Supabase SQL Editor

-- 1. 建立分潤撥款記錄表
CREATE TABLE IF NOT EXISTS commission_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commission_id UUID NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
    payment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'transfer',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100)
);

-- 2. 為commissions表添加累計撥款欄位
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS total_paid NUMERIC(12,2) DEFAULT 0;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(12,2) DEFAULT 0;

-- 3. 建立索引提升查詢效能
CREATE INDEX IF NOT EXISTS idx_commission_payments_commission_id ON commission_payments(commission_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_date ON commission_payments(payment_date);

-- 4. 更新現有分潤的剩餘金額
UPDATE commissions 
SET remaining_amount = amount - COALESCE(total_paid, 0)
WHERE remaining_amount IS NULL OR remaining_amount = 0;

-- 5. 建立觸發器函數，自動更新分潤累計金額
CREATE OR REPLACE FUNCTION update_commission_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- 更新對應分潤的累計撥款金額
    UPDATE commissions 
    SET 
        total_paid = (
            SELECT COALESCE(SUM(payment_amount), 0) 
            FROM commission_payments 
            WHERE commission_id = NEW.commission_id
        ),
        remaining_amount = amount - (
            SELECT COALESCE(SUM(payment_amount), 0) 
            FROM commission_payments 
            WHERE commission_id = NEW.commission_id
        )
    WHERE id = NEW.commission_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. 建立觸發器
DROP TRIGGER IF EXISTS trigger_update_commission_totals ON commission_payments;
CREATE TRIGGER trigger_update_commission_totals
    AFTER INSERT OR UPDATE OR DELETE ON commission_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_commission_totals();

-- 7. 檢視分潤詳細狀況
CREATE OR REPLACE VIEW commission_summary AS
SELECT 
    c.id as commission_id,
    p.project_code,
    p.client_name,
    u.name as salesperson,
    c.amount as total_commission,
    COALESCE(c.total_paid, 0) as paid_amount,
    COALESCE(c.remaining_amount, c.amount) as remaining_amount,
    CASE 
        WHEN c.total_paid >= c.amount THEN '已完成'
        WHEN c.total_paid > 0 THEN '部分撥款'
        ELSE '待撥款'
    END as payment_status,
    ROUND((COALESCE(c.total_paid, 0) / c.amount) * 100, 2) as payment_percentage
FROM commissions c
JOIN projects p ON c.project_id = p.id
JOIN users u ON c.user_id = u.id;

-- 成功訊息
DO $$ 
BEGIN
    RAISE NOTICE 'Detailed payment tracking system created successfully!';
    RAISE NOTICE 'New features:';
    RAISE NOTICE '- commission_payments table for batch commission payments';
    RAISE NOTICE '- total_paid and remaining_amount columns in commissions';
    RAISE NOTICE '- Automatic calculation triggers';
    RAISE NOTICE '- commission_summary view for easy reporting';
END $$;