-- 修正版分潤同步腳本
-- 根據實際撥款情況即時更新分潤狀態

-- 1. 將有撥款記錄的分潤標記為已撥款
UPDATE commissions 
SET status = 'paid' 
WHERE project_id IN (
  SELECT DISTINCT pi.project_id 
  FROM project_installments pi 
  WHERE pi.status = 'paid' 
  AND pi.actual_commission IS NOT NULL 
  AND pi.actual_commission > 0
);

-- 2. 將有收款但還沒撥款的分潤標記為已核准
UPDATE commissions 
SET status = 'approved' 
WHERE status = 'pending' 
AND project_id IN (
  SELECT DISTINCT pi.project_id 
  FROM project_installments pi 
  WHERE pi.status = 'paid'
)
AND project_id NOT IN (
  SELECT DISTINCT pi.project_id 
  FROM project_installments pi 
  WHERE pi.status = 'paid' 
  AND pi.actual_commission IS NOT NULL 
  AND pi.actual_commission > 0
);

-- 3. 檢查同步後的狀況
SELECT 
  p.project_code,
  p.client_name,
  c.status as commission_status,
  c.amount as commission_amount,
  COUNT(pi_paid.id) as paid_installments,
  COUNT(pi_total.id) as total_installments,
  COALESCE(SUM(pi_paid.actual_commission), 0) as total_commission_paid
FROM projects p
LEFT JOIN commissions c ON p.id = c.project_id
LEFT JOIN project_installments pi_total ON p.id = pi_total.project_id
LEFT JOIN project_installments pi_paid ON p.id = pi_paid.project_id AND pi_paid.status = 'paid'
WHERE c.id IS NOT NULL
GROUP BY p.id, p.project_code, p.client_name, c.status, c.amount
ORDER BY p.created_at DESC;