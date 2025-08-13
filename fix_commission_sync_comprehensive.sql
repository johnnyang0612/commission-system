-- 全面修復分潤同步問題的SQL腳本
-- 統一專案管理、付款記錄、分潤管理三個頁面的數據來源

-- ==========================================
-- 步驟1: 檢查當前數據狀況
-- ==========================================

-- 檢查是否有"孤兒"撥款記錄（專案頁面撥款但沒有對應的 commission_payouts）
SELECT 
    '專案頁面撥款但未同步到 commission_payouts 的記錄數' as description,
    COUNT(*) as count
FROM project_installments pi
LEFT JOIN commission_payouts cp ON cp.related_installment_id = pi.id
WHERE pi.actual_commission > 0 
AND cp.id IS NULL;

-- 檢查是否有重複的撥款記錄
SELECT 
    '可能重複的撥款記錄' as description,
    pi.project_id,
    pi.installment_number,
    pi.actual_commission,
    COUNT(cp.id) as payout_records
FROM project_installments pi
LEFT JOIN commission_payouts cp ON cp.related_installment_id = pi.id
WHERE pi.actual_commission > 0
GROUP BY pi.project_id, pi.installment_number, pi.actual_commission
HAVING COUNT(cp.id) > 1;

-- ==========================================
-- 步驟2: 為缺失的專案撥款創建 commission_payouts 記錄
-- ==========================================

-- 先確保所有專案都有對應的分潤記錄
INSERT INTO commissions (project_id, user_id, percentage, amount, status, created_at)
SELECT DISTINCT
    pi.project_id,
    p.assigned_to as user_id,
    CASE 
        WHEN p.use_fixed_commission AND p.fixed_commission_percentage IS NOT NULL 
        THEN p.fixed_commission_percentage
        ELSE 35.0  -- 預設35%
    END as percentage,
    p.amount * (
        CASE 
            WHEN p.use_fixed_commission AND p.fixed_commission_percentage IS NOT NULL 
            THEN p.fixed_commission_percentage / 100
            ELSE 0.35  -- 預設35%
        END
    ) as amount,
    'pending' as status,
    NOW() as created_at
FROM project_installments pi
JOIN projects p ON p.id = pi.project_id
LEFT JOIN commissions c ON c.project_id = pi.project_id
WHERE pi.actual_commission > 0
AND c.id IS NULL;

-- 為所有缺失的專案撥款創建對應的 commission_payouts 記錄
INSERT INTO commission_payouts (
    commission_id, 
    project_id, 
    user_id, 
    payout_date, 
    payout_amount, 
    payment_basis,
    payout_ratio,
    related_installment_id,
    notes,
    status,
    created_at
)
SELECT 
    c.id as commission_id,
    pi.project_id,
    c.user_id,
    COALESCE(pi.commission_payment_date, pi.payment_date, CURRENT_DATE) as payout_date,
    pi.actual_commission as payout_amount,
    COALESCE(pi.actual_amount, pi.amount) as payment_basis,
    CASE 
        WHEN COALESCE(pi.actual_amount, pi.amount) > 0 
        THEN pi.actual_commission::decimal / COALESCE(pi.actual_amount, pi.amount)
        ELSE 0 
    END as payout_ratio,
    pi.id as related_installment_id,
    CONCAT('專案期數撥款同步 - 第', pi.installment_number, '期') as notes,
    'paid' as status,
    COALESCE(pi.commission_payment_date, pi.payment_date, NOW()) as created_at
FROM project_installments pi
JOIN commissions c ON c.project_id = pi.project_id
LEFT JOIN commission_payouts cp ON cp.related_installment_id = pi.id
WHERE pi.actual_commission > 0 
AND cp.id IS NULL;

-- ==========================================
-- 步驟3: 重新創建 commission_summary 視圖
-- ==========================================

-- 刪除舊視圖
DROP VIEW IF EXISTS commission_summary CASCADE;

-- 重新創建完整的視圖
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
    COALESCE(payout_stats.total_paid_amount, 0)::DECIMAL(10,2) as total_paid_amount,
    COALESCE(payout_stats.payout_count, 0)::INTEGER as payout_count,
    (COALESCE(c.amount, 0) - COALESCE(payout_stats.total_paid_amount, 0))::DECIMAL(10,2) as remaining_amount,
    CASE 
        WHEN COALESCE(c.amount, 0) > 0 THEN 
            (COALESCE(payout_stats.total_paid_amount, 0) / c.amount * 100)::DECIMAL(5,2)
        ELSE 0 
    END as paid_percentage,
    payout_stats.last_payout_date
FROM commissions c
LEFT JOIN (
    SELECT 
        commission_id,
        SUM(payout_amount) as total_paid_amount,
        COUNT(*) as payout_count,
        MAX(payout_date) as last_payout_date
    FROM commission_payouts 
    WHERE status = 'paid'
    GROUP BY commission_id
) payout_stats ON c.id = payout_stats.commission_id;

-- ==========================================
-- 步驟4: 驗證修復結果
-- ==========================================

-- 檢查修復後的數據一致性
SELECT '=== 修復後數據統計 ===' as info;

SELECT 
    'commission_summary 視圖記錄數' as metric,
    COUNT(*) as count
FROM commission_summary;

SELECT 
    'commission_payouts 記錄數' as metric,
    COUNT(*) as count  
FROM commission_payouts WHERE status = 'paid';

SELECT 
    'project_installments 撥款記錄數' as metric,
    COUNT(*) as count
FROM project_installments WHERE actual_commission > 0;

-- 檢查是否還有未同步的記錄
SELECT 
    '仍未同步的專案撥款記錄' as metric,
    COUNT(*) as count
FROM project_installments pi
LEFT JOIN commission_payouts cp ON cp.related_installment_id = pi.id
WHERE pi.actual_commission > 0 AND cp.id IS NULL;

-- 顯示最新的分潤數據
SELECT 
    '最新分潤數據預覽' as info,
    cs.id,
    cs.amount as total_commission,
    cs.total_paid_amount,
    cs.remaining_amount,
    cs.paid_percentage
FROM commission_summary cs
ORDER BY cs.created_at DESC
LIMIT 5;