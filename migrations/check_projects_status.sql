-- 檢查專案狀況
SELECT 
    'Projects with installments' as category,
    COUNT(*) as count
FROM projects 
WHERE id IN (SELECT DISTINCT project_id FROM project_installments WHERE project_id IS NOT NULL)

UNION ALL

SELECT 
    'Projects without installments' as category,
    COUNT(*) as count
FROM projects 
WHERE id NOT IN (SELECT DISTINCT project_id FROM project_installments WHERE project_id IS NOT NULL)

UNION ALL

SELECT 
    'Projects missing payment_template' as category,
    COUNT(*) as count
FROM projects 
WHERE payment_template IS NULL

UNION ALL

SELECT 
    'Projects missing amount' as category,
    COUNT(*) as count
FROM projects 
WHERE amount IS NULL OR amount = 0

UNION ALL

SELECT 
    'Projects ready for installment generation' as category,
    COUNT(*) as count
FROM projects 
WHERE id NOT IN (SELECT DISTINCT project_id FROM project_installments WHERE project_id IS NOT NULL)
AND payment_template IS NOT NULL 
AND amount IS NOT NULL
AND amount > 0;

-- 顯示需要生成期數的具體專案
SELECT 
    project_code,
    client_name,
    payment_template,
    amount,
    type,
    assigned_to,
    CASE 
        WHEN assigned_to IS NULL THEN '缺少業務員'
        WHEN payment_template IS NULL THEN '缺少付款模板'  
        WHEN amount IS NULL OR amount = 0 THEN '缺少金額'
        ELSE '符合條件'
    END as status
FROM projects 
WHERE id NOT IN (SELECT DISTINCT project_id FROM project_installments WHERE project_id IS NOT NULL)
ORDER BY created_at DESC;