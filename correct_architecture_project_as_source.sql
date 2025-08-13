-- 正確的架構設計：以專案管理為數據來源
-- 專案管理 = 實際操作地點（主數據）
-- 分潤管理、付款管理 = 報表統計頁面（從專案管理讀取數據）

SELECT '=== 重新設計：以專案管理為唯一數據來源 ===' as info;

-- ========================================
-- 架構原則：
-- 1. 專案管理 (project_installments) = 主要操作介面，真實數據
-- 2. 分潤管理 = 從 project_installments 統計顯示
-- 3. 付款記錄 = 從 project_installments 統計顯示  
-- 4. commission_payouts 表應該刪除或僅作為歷史記錄
-- ========================================

-- 步驟1: 檢查當前兩個來源的數據差異
SELECT '=== 數據來源對比 ===' as info;

-- 專案管理的撥款記錄（應該是主要來源）
SELECT 
    '專案管理撥款記錄 (project_installments)' as source,
    COUNT(*) as records,
    SUM(actual_commission) as total_amount
FROM project_installments 
WHERE actual_commission > 0;

-- 分潤管理的撥款記錄（應該清理）
SELECT 
    '分潤管理撥款記錄 (commission_payouts)' as source,
    COUNT(*) as records,
    SUM(payout_amount) as total_amount
FROM commission_payouts 
WHERE status = 'paid';

-- ========================================
-- 步驟2: 保留專案管理數據，清理重複的 commission_payouts
-- ========================================

-- 方案A: 完全刪除 commission_payouts 的重複記錄
-- （保留沒有對應 installment 的記錄，如付款頁面的自動撥款）

DELETE FROM commission_payouts 
WHERE related_installment_id IS NOT NULL;

-- 或者更安全的方案：標記為已刪除
-- UPDATE commission_payouts 
-- SET status = 'deleted', notes = CONCAT(notes, ' [已刪除-重複記錄]')
-- WHERE related_installment_id IS NOT NULL;

-- ========================================  
-- 步驟3: 重新設計視圖 - 以 project_installments 為主要數據源
-- ========================================

-- 刪除舊的視圖
DROP VIEW IF EXISTS commission_summary CASCADE;
DROP VIEW IF EXISTS installment_commission_details CASCADE;

-- 創建基於專案管理的分潤統計視圖
CREATE VIEW commission_summary AS
SELECT 
    c.id,
    c.project_id,
    c.user_id,
    c.percentage,
    c.amount as total_commission_amount,
    c.status,
    c.created_at,
    
    -- 基於 project_installments 的實際撥款統計
    COALESCE(installment_stats.total_paid_amount, 0)::DECIMAL(10,2) as total_paid_amount,
    COALESCE(installment_stats.payout_count, 0)::INTEGER as payout_count,
    (COALESCE(c.amount, 0) - COALESCE(installment_stats.total_paid_amount, 0))::DECIMAL(10,2) as remaining_amount,
    
    CASE 
        WHEN COALESCE(c.amount, 0) > 0 THEN 
            (COALESCE(installment_stats.total_paid_amount, 0) / c.amount * 100)::DECIMAL(5,2)
        ELSE 0 
    END as paid_percentage,
    
    installment_stats.last_payout_date

FROM commissions c
LEFT JOIN (
    -- 從 project_installments 統計每個專案的撥款情況
    SELECT 
        pi.project_id,
        SUM(pi.actual_commission) as total_paid_amount,
        COUNT(*) as payout_count,
        MAX(pi.commission_payment_date) as last_payout_date
    FROM project_installments pi
    WHERE pi.actual_commission > 0
    GROUP BY pi.project_id
) installment_stats ON c.project_id = installment_stats.project_id;

-- 創建期數詳細視圖（供專案管理頁面使用）
CREATE VIEW project_installment_details AS
SELECT 
    pi.id,
    pi.project_id,
    pi.installment_number,
    pi.due_date,
    pi.amount,
    pi.actual_amount,
    pi.payment_date,
    pi.status,
    
    -- 分潤相關資訊（來自 project_installments 本身）
    pi.commission_amount,
    pi.actual_commission,
    pi.commission_payment_date,
    pi.commission_status,
    
    -- 專案資訊
    p.project_name,
    p.project_code,
    p.client_name,
    
    -- 業務人員資訊
    u.name as assigned_user_name,
    u.email as assigned_user_email

FROM project_installments pi
JOIN projects p ON p.id = pi.project_id
LEFT JOIN users u ON u.id = p.assigned_to;

-- 創建付款統計視圖（供付款記錄頁面使用）
CREATE VIEW payment_commission_summary AS
SELECT 
    p.id as project_id,
    p.project_code,
    p.project_name,
    p.client_name,
    p.amount as project_amount,
    
    -- 收款統計（從 project_installments）
    COALESCE(payment_stats.total_received, 0) as total_received,
    COALESCE(payment_stats.received_count, 0) as received_installments,
    
    -- 撥款統計（從 project_installments）
    COALESCE(commission_stats.total_commission_paid, 0) as total_commission_paid,
    COALESCE(commission_stats.commission_count, 0) as commission_installments,
    
    -- 計算比例
    CASE 
        WHEN p.amount > 0 THEN 
            (COALESCE(payment_stats.total_received, 0) / p.amount * 100)::DECIMAL(5,2)
        ELSE 0 
    END as payment_percentage,
    
    CASE 
        WHEN c.amount > 0 THEN 
            (COALESCE(commission_stats.total_commission_paid, 0) / c.amount * 100)::DECIMAL(5,2) 
        ELSE 0
    END as commission_percentage

FROM projects p
LEFT JOIN commissions c ON c.project_id = p.id
LEFT JOIN (
    -- 收款統計
    SELECT 
        project_id,
        SUM(COALESCE(actual_amount, amount)) as total_received,
        COUNT(*) as received_count
    FROM project_installments 
    WHERE status = 'paid'
    GROUP BY project_id
) payment_stats ON payment_stats.project_id = p.id
LEFT JOIN (
    -- 撥款統計
    SELECT 
        project_id,
        SUM(actual_commission) as total_commission_paid,
        COUNT(*) as commission_count
    FROM project_installments 
    WHERE actual_commission > 0
    GROUP BY project_id
) commission_stats ON commission_stats.project_id = p.id;

-- ========================================
-- 步驟4: 驗證新架構
-- ========================================

SELECT '=== 新架構驗證 ===' as info;

-- 檢查主要數據來源（專案管理）
SELECT 
    '專案管理 - 總撥款記錄' as metric,
    COUNT(*) as count,
    SUM(actual_commission) as total_amount
FROM project_installments 
WHERE actual_commission > 0;

-- 檢查分潤管理視圖
SELECT 
    '分潤管理視圖 - 記錄數' as metric,
    COUNT(*) as count
FROM commission_summary;

-- 檢查付款管理視圖
SELECT 
    '付款管理視圖 - 記錄數' as metric,
    COUNT(*) as count
FROM payment_commission_summary;

-- 顯示統一後的數據（以專案管理為準）
SELECT 
    '專案管理主數據預覽' as info,
    project_id,
    installment_number,
    actual_commission,
    commission_payment_date,
    commission_status
FROM project_installment_details
WHERE actual_commission > 0
ORDER BY commission_payment_date DESC
LIMIT 5;

-- 顯示分潤管理應該看到的統計
SELECT 
    '分潤管理統計預覽' as info,
    project_id,
    total_commission_amount,
    total_paid_amount,
    remaining_amount,
    paid_percentage
FROM commission_summary
ORDER BY last_payout_date DESC
LIMIT 5;

SELECT '=== 架構重新設計完成：專案管理為唯一數據來源 ===' as info;