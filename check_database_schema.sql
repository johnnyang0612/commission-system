-- 檢查數據庫中各表的ID類型
SELECT 
    t.table_name,
    c.column_name,
    c.data_type,
    c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public' 
    AND t.table_type = 'BASE TABLE'
    AND c.column_name = 'id'
    AND t.table_name IN (
        'projects', 
        'users', 
        'commissions', 
        'payments',
        'project_documents',
        'project_costs'
    )
ORDER BY t.table_name;