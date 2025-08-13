-- 重新設計：統一使用單一撥款表的系統架構
-- 移除重複的撥款記錄，確保只有一個撥款數據來源

-- ========================================
-- 方案：以 commission_payouts 為唯一撥款記錄來源
-- ========================================

-- 步驟1: 將現有的 project_installments 撥款記錄遷移到 commission_payouts
-- 但首先檢查是否已經有對應的記錄，避免重複

SELECT '=== 開始重新設計單一撥款系統 ===' as info;

-- 檢查當前狀況
SELECT 
    '目前 project_installments 中有撥款記錄' as description,
    COUNT(*) as count
FROM project_installments 
WHERE actual_commission > 0;

SELECT 
    '目前 commission_payouts 中有撥款記錄' as description,
    COUNT(*) as count
FROM commission_payouts;

-- ========================================
-- 步驟2: 遷移數據到統一表
-- ========================================

-- 確保所有專案都有對應的分潤記錄
INSERT INTO commissions (project_id, user_id, percentage, amount, status, created_at)
SELECT DISTINCT
    pi.project_id,
    p.assigned_to as user_id,
    CASE 
        WHEN p.use_fixed_commission AND p.fixed_commission_percentage IS NOT NULL 
        THEN p.fixed_commission_percentage
        ELSE 35.0
    END as percentage,
    p.amount * (
        CASE 
            WHEN p.use_fixed_commission AND p.fixed_commission_percentage IS NOT NULL 
            THEN p.fixed_commission_percentage / 100
            ELSE 0.35
        END
    ) as amount,
    'pending' as status,
    NOW() as created_at
FROM project_installments pi
JOIN projects p ON p.id = pi.project_id
LEFT JOIN commissions c ON c.project_id = pi.project_id
WHERE pi.actual_commission > 0
AND c.id IS NULL;

-- 將所有 project_installments 的撥款記錄遷移到 commission_payouts
INSERT INTO commission_payouts (
    commission_id,
    project_id,
    user_id,
    payout_date,
    payout_amount,
    payment_basis,
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
    pi.id as related_installment_id,
    CONCAT('期數撥款 - 第', pi.installment_number, '期') as notes,
    'paid' as status,
    COALESCE(pi.commission_payment_date, pi.payment_date, NOW()) as created_at
FROM project_installments pi
JOIN commissions c ON c.project_id = pi.project_id
LEFT JOIN commission_payouts cp ON cp.related_installment_id = pi.id
WHERE pi.actual_commission > 0 
AND cp.id IS NULL;  -- 避免重複插入

-- ========================================
-- 步驟3: 清理 project_installments 中的撥款欄位
-- ========================================

-- 選項A: 保留欄位但清空數據（推薦，保持表結構完整）
UPDATE project_installments 
SET 
    actual_commission = NULL,
    commission_status = NULL,
    commission_payment_date = NULL
WHERE actual_commission > 0;

-- 選項B: 完全移除撥款相關欄位（如果要徹底清理）
-- ALTER TABLE project_installments 
-- DROP COLUMN IF EXISTS actual_commission,
-- DROP COLUMN IF EXISTS commission_status,
-- DROP COLUMN IF EXISTS commission_payment_date;

-- ========================================
-- 步驟4: 重新創建視圖和統一數據來源
-- ========================================

-- 刪除舊視圖
DROP VIEW IF EXISTS commission_summary CASCADE;

-- 創建新的統一視圖
CREATE VIEW commission_summary AS
SELECT 
    c.id,
    c.project_id,
    c.user_id,
    c.percentage,
    c.amount,
    c.status,
    c.created_at,
    -- 只基於 commission_payouts 的統計
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

-- ========================================
-- 步驟5: 創建統一的撥款查詢視圖（供專案頁面使用）
-- ========================================

-- 創建期數撥款明細視圖，基於 commission_payouts
CREATE OR REPLACE VIEW installment_commission_details AS
SELECT 
    pi.id as installment_id,
    pi.project_id,
    pi.installment_number,
    pi.amount as installment_amount,
    pi.actual_amount,
    pi.payment_date,
    pi.status as installment_status,
    -- 從 commission_payouts 獲取撥款資訊
    cp.id as payout_id,
    cp.payout_amount as actual_commission,
    cp.payout_date as commission_payment_date,
    CASE WHEN cp.id IS NOT NULL THEN 'paid' ELSE 'pending' END as commission_status
FROM project_installments pi
LEFT JOIN commission_payouts cp ON cp.related_installment_id = pi.id AND cp.status = 'paid';

-- ========================================
-- 步驟6: 驗證統一後的結果
-- ========================================

SELECT '=== 統一後的數據驗證 ===' as info;

-- 撥款記錄統計
SELECT 
    'commission_payouts 總撥款記錄' as metric,
    COUNT(*) as count,
    SUM(payout_amount) as total_amount
FROM commission_payouts 
WHERE status = 'paid';

-- 確認 project_installments 已清理
SELECT 
    'project_installments 剩餘撥款記錄' as metric,
    COUNT(*) as count
FROM project_installments 
WHERE actual_commission > 0;

-- 檢查新視圖
SELECT 
    'commission_summary 視圖記錄' as metric,
    COUNT(*) as count
FROM commission_summary;

SELECT 
    'installment_commission_details 視圖記錄' as metric,
    COUNT(*) as count
FROM installment_commission_details;

-- 顯示統一後的數據
SELECT 
    '統一後的撥款數據預覽' as info,
    project_id,
    installment_number,
    actual_commission,
    commission_payment_date,
    commission_status
FROM installment_commission_details
WHERE actual_commission > 0
ORDER BY commission_payment_date DESC
LIMIT 10;

SELECT '=== 重新設計完成 ===' as info;