-- 同步現有撥款和收款資料
-- Execute this in Supabase SQL Editor

-- 1. 從project_installments同步分潤撥款進度到commissions表
UPDATE commissions 
SET total_paid = COALESCE(installment_totals.total_commission_paid, 0),
    remaining_amount = amount - COALESCE(installment_totals.total_commission_paid, 0)
FROM (
    SELECT 
        pi.project_id,
        SUM(COALESCE(pi.actual_commission, 0)) as total_commission_paid
    FROM project_installments pi
    WHERE pi.status = 'paid' AND pi.actual_commission IS NOT NULL
    GROUP BY pi.project_id
) as installment_totals
WHERE commissions.project_id = installment_totals.project_id;

-- 2. 同步project_installments的收款記錄到payments表
INSERT INTO payments (project_id, payment_date, amount, method, created_at)
SELECT DISTINCT
    pi.project_id,
    COALESCE(pi.paid_date, CURRENT_DATE) as payment_date,
    COALESCE(pi.actual_amount, pi.amount) as amount,
    'transfer' as method,
    CURRENT_TIMESTAMP as created_at
FROM project_installments pi
WHERE pi.status = 'paid' 
AND pi.project_id NOT IN (
    SELECT DISTINCT project_id FROM payments WHERE project_id IS NOT NULL
)
AND pi.project_id IS NOT NULL;

-- 3. 檢查同步結果 - 分潤進度
SELECT 
    p.project_code,
    p.client_name,
    c.amount as total_commission,
    c.total_paid as paid_commission,
    c.remaining_amount,
    ROUND((c.total_paid / NULLIF(c.amount, 0)) * 100, 2) as payment_percentage
FROM commissions c
JOIN projects p ON c.project_id = p.id
WHERE c.total_paid > 0
ORDER BY p.project_code;

-- 4. 檢查同步結果 - 收款記錄
SELECT 
    p.project_code,
    p.client_name,
    COUNT(pay.id) as payment_records,
    SUM(pay.amount) as total_received
FROM projects p
LEFT JOIN payments pay ON p.id = pay.project_id
GROUP BY p.id, p.project_code, p.client_name
ORDER BY p.project_code;

-- 成功訊息
DO $$ 
BEGIN
    RAISE NOTICE 'Data synchronization completed!';
    RAISE NOTICE 'Check the results above to verify data integrity.';
END $$;