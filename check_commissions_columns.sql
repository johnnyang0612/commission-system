-- 檢查 commissions 表的所有欄位
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'commissions'
ORDER BY ordinal_position;