-- 修復 commission_summary 視圖，移除不存在的 updated_at 欄位
-- 先檢查 commissions 表的實際結構

-- 1. 查看 commissions 表的欄位
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'commissions' 
ORDER BY ordinal_position;

-- 2. 先刪除舊視圖
DROP VIEW IF EXISTS commission_summary CASCADE;

-- 3. 重新創建視圖（不包含 updated_at）
CREATE VIEW commission_summary AS
SELECT 
    c.id,
    c.project_id,
    c.user_id,
    c.percentage,
    c.amount,
    c.status,
    c.created_at,
    -- 基於 commission_payouts 表的實際撥款統計
    COALESCE(SUM(cp.payout_amount), 0)::DECIMAL(10,2) as total_paid_amount,
    COALESCE(COUNT(cp.id), 0)::INTEGER as payout_count,
    (COALESCE(c.amount, 0) - COALESCE(SUM(cp.payout_amount), 0))::DECIMAL(10,2) as remaining_amount,
    CASE 
        WHEN COALESCE(c.amount, 0) > 0 THEN 
            (COALESCE(SUM(cp.payout_amount), 0) / c.amount * 100)::DECIMAL(5,2)
        ELSE 0 
    END as paid_percentage,
    -- 最近撥款日期
    MAX(cp.payout_date) as last_payout_date
FROM commissions c
LEFT JOIN commission_payouts cp ON c.id = cp.commission_id AND cp.status = 'paid'
GROUP BY 
    c.id,
    c.project_id,
    c.user_id,
    c.percentage,
    c.amount,
    c.status,
    c.created_at;

-- 4. 檢查視圖創建結果
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views 
WHERE viewname = 'commission_summary';

-- 5. 測試視圖查詢
SELECT 
    id,
    amount,
    total_paid_amount,
    remaining_amount,
    paid_percentage,
    payout_count,
    last_payout_date
FROM commission_summary 
ORDER BY created_at DESC 
LIMIT 5;