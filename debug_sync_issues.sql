-- 調試分潤同步問題的完整SQL腳本
-- 檢查各表的數據一致性

-- 1. 檢查 commissions 表結構和數據
SELECT '=== COMMISSIONS TABLE ===' as info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'commissions' 
ORDER BY ordinal_position;

SELECT 'Total commissions:', COUNT(*) FROM commissions;
SELECT * FROM commissions ORDER BY created_at DESC LIMIT 3;

-- 2. 檢查 commission_payouts 表結構和數據  
SELECT '=== COMMISSION_PAYOUTS TABLE ===' as info;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'commission_payouts' 
ORDER BY ordinal_position;

SELECT 'Total payouts:', COUNT(*) FROM commission_payouts;
SELECT * FROM commission_payouts ORDER BY payout_date DESC LIMIT 3;

-- 3. 檢查 project_installments 中的撥款記錄
SELECT '=== PROJECT_INSTALLMENTS COMMISSIONS ===' as info;
SELECT 
    id,
    project_id,
    installment_number,
    amount,
    actual_amount,
    commission_amount,
    actual_commission,
    commission_status,
    commission_payment_date
FROM project_installments 
WHERE actual_commission > 0 OR commission_amount > 0
ORDER BY commission_payment_date DESC 
LIMIT 5;

-- 4. 檢查是否存在 commission_summary 視圖
SELECT '=== COMMISSION_SUMMARY VIEW ===' as info;
SELECT COUNT(*) as view_exists 
FROM information_schema.views 
WHERE table_name = 'commission_summary';

-- 如果視圖存在，查看其數據
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'commission_summary') THEN
        RAISE NOTICE 'Commission summary view exists, showing data...';
    ELSE
        RAISE NOTICE 'Commission summary view does NOT exist!';
    END IF;
END $$;

-- 5. 比較不同來源的分潤數據
SELECT '=== DATA COMPARISON ===' as info;

-- 從 project_installments 計算的撥款總額
SELECT 
    'FROM project_installments' as source,
    SUM(actual_commission) as total_paid_commission
FROM project_installments 
WHERE actual_commission > 0;

-- 從 commission_payouts 計算的撥款總額  
SELECT 
    'FROM commission_payouts' as source,
    SUM(payout_amount) as total_paid_commission
FROM commission_payouts 
WHERE status = 'paid';

-- 6. 檢查同一專案的數據一致性
SELECT '=== PROJECT CONSISTENCY CHECK ===' as info;
SELECT 
    pi.project_id,
    SUM(pi.actual_commission) as installments_total,
    (SELECT SUM(cp.payout_amount) 
     FROM commission_payouts cp 
     JOIN commissions c ON cp.commission_id = c.id 
     WHERE c.project_id = pi.project_id AND cp.status = 'paid') as payouts_total
FROM project_installments pi
WHERE pi.actual_commission > 0
GROUP BY pi.project_id
HAVING SUM(pi.actual_commission) > 0
ORDER BY pi.project_id;

-- 7. 檢查缺少關聯的撥款記錄
SELECT '=== MISSING PAYOUT RECORDS ===' as info;
SELECT 
    pi.id as installment_id,
    pi.project_id,
    pi.installment_number,
    pi.actual_commission,
    pi.commission_payment_date,
    cp.id as payout_record_exists
FROM project_installments pi
LEFT JOIN commission_payouts cp ON cp.related_installment_id = pi.id
WHERE pi.actual_commission > 0 
AND cp.id IS NULL
ORDER BY pi.commission_payment_date DESC;