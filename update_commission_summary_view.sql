-- 更新 commission_summary 視圖以正確顯示 commission_payouts 的資料
-- 確保分潤管理頁面顯示正確的已撥款和待撥款金額

-- 1. 先刪除舊視圖
DROP VIEW IF EXISTS commission_summary CASCADE;

-- 2. 重新創建視圖
CREATE VIEW commission_summary AS
SELECT 
    c.id,
    c.project_id,
    c.user_id,
    c.percentage,
    c.amount,
    c.status,
    c.created_at,
    c.updated_at,
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
    c.created_at,
    c.updated_at;

-- 3. 檢查視圖是否創建成功
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views 
WHERE viewname = 'commission_summary';

-- 4. 測試視圖查詢
SELECT 
    id,
    amount,
    total_paid_amount,
    remaining_amount,
    paid_percentage,
    payout_count
FROM commission_summary 
ORDER BY created_at DESC 
LIMIT 5;