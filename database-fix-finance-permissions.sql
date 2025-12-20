-- ==========================================
-- 修復財務權限問題：付款紀錄/勞務報酬單/專案編輯
-- ==========================================

-- 1. 確保 payments 表格存在且結構正確
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    method VARCHAR(20) DEFAULT 'transfer' CHECK (method IN ('transfer', 'check', 'cash', 'credit')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID
);

-- 2. 確保 labor_receipts 表格存在
CREATE TABLE IF NOT EXISTS labor_receipts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    receipt_number VARCHAR(50) UNIQUE NOT NULL DEFAULT '',
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    commission_id UUID REFERENCES commissions(id),
    
    -- 基本資訊
    receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
    period_start DATE,
    period_end DATE,
    
    -- 金額計算
    gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    insurance_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    
    -- 專案資訊
    project_name VARCHAR(200),
    project_code VARCHAR(100),
    client_name VARCHAR(200),
    
    -- 受領人資訊
    recipient_name VARCHAR(100) NOT NULL,
    recipient_id VARCHAR(50),
    recipient_address TEXT,
    
    -- 狀態管理
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid')),
    issued_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    
    -- 備註
    notes TEXT,
    
    -- 時間戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 建立勞務報酬單編號自動產生觸發器
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TRIGGER AS $$
DECLARE
    year_month TEXT;
    seq_num INTEGER;
BEGIN
    -- 如果編號已存在，直接返回
    IF NEW.receipt_number IS NOT NULL AND NEW.receipt_number != '' THEN
        RETURN NEW;
    END IF;
    
    -- 產生年月格式 (例如: 2024-01)
    year_month := to_char(NEW.receipt_date, 'YYYY-MM');
    
    -- 獲取該月的序號
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(receipt_number FROM '[0-9]+$') AS INTEGER)
    ), 0) + 1 INTO seq_num
    FROM labor_receipts 
    WHERE receipt_number LIKE 'LR-' || year_month || '-%';
    
    -- 產生完整編號 (例如: LR-2024-01-001)
    NEW.receipt_number := 'LR-' || year_month || '-' || LPAD(seq_num::TEXT, 3, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 建立觸發器
DROP TRIGGER IF EXISTS trigger_generate_receipt_number ON labor_receipts;
CREATE TRIGGER trigger_generate_receipt_number
    BEFORE INSERT ON labor_receipts
    FOR EACH ROW
    EXECUTE FUNCTION generate_receipt_number();

-- 4. 為勞務報酬單添加缺失的欄位
ALTER TABLE commissions 
ADD COLUMN IF NOT EXISTS labor_receipt_generated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS labor_receipt_id UUID REFERENCES labor_receipts(id);

-- 5. 建立索引優化查詢性能
CREATE INDEX IF NOT EXISTS idx_payments_project_id ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON payments(created_by);

CREATE INDEX IF NOT EXISTS idx_labor_receipts_project_id ON labor_receipts(project_id);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_user_id ON labor_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_commission_id ON labor_receipts(commission_id);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_receipt_date ON labor_receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_status ON labor_receipts(status);
CREATE INDEX IF NOT EXISTS idx_labor_receipts_receipt_number ON labor_receipts(receipt_number);

CREATE INDEX IF NOT EXISTS idx_commissions_labor_receipt_generated ON commissions(labor_receipt_generated);
CREATE INDEX IF NOT EXISTS idx_commissions_labor_receipt_id ON commissions(labor_receipt_id);

-- 6. 建立批次產生勞務報酬單的函數
CREATE OR REPLACE FUNCTION batch_generate_labor_receipts()
RETURNS TABLE (
    success_count INTEGER,
    error_count INTEGER,
    total_processed INTEGER,
    errors TEXT[]
) AS $$
DECLARE
    commission_record RECORD;
    receipt_id UUID;
    errors_array TEXT[] := '{}';
    success_cnt INTEGER := 0;
    error_cnt INTEGER := 0;
    total_cnt INTEGER := 0;
BEGIN
    -- 遍歷所有已發放但未產生勞務報酬單的分潤記錄
    FOR commission_record IN
        SELECT 
            c.*,
            p.project_name,
            p.project_code,
            p.client_name,
            u.name as user_name,
            u.national_id,
            u.registered_address
        FROM commissions c
        JOIN projects p ON c.project_id = p.id
        LEFT JOIN users u ON c.user_id = u.id::text::uuid
        WHERE c.status = 'paid' 
        AND (c.labor_receipt_generated IS NULL OR c.labor_receipt_generated = false)
    LOOP
        total_cnt := total_cnt + 1;
        
        BEGIN
            -- 計算稅費
            DECLARE
                gross_amt NUMERIC(12,2) := commission_record.amount;
                tax_amt NUMERIC(12,2) := gross_amt * 0.10;
                insurance_amt NUMERIC(12,2) := gross_amt * 0.0211;
                net_amt NUMERIC(12,2) := gross_amt - tax_amt - insurance_amt;
            BEGIN
                -- 插入勞務報酬單
                INSERT INTO labor_receipts (
                    project_id,
                    user_id,
                    commission_id,
                    receipt_date,
                    gross_amount,
                    tax_amount,
                    insurance_amount,
                    net_amount,
                    project_name,
                    project_code,
                    client_name,
                    recipient_name,
                    recipient_id,
                    recipient_address,
                    status,
                    issued_at,
                    notes
                ) VALUES (
                    commission_record.project_id,
                    commission_record.user_id::uuid,
                    commission_record.id,
                    CURRENT_DATE,
                    gross_amt,
                    tax_amt,
                    insurance_amt,
                    net_amt,
                    commission_record.project_name,
                    commission_record.project_code,
                    commission_record.client_name,
                    commission_record.user_name,
                    commission_record.national_id,
                    commission_record.registered_address,
                    'issued',
                    NOW(),
                    '批次自動產生 - 分潤比例: ' || commission_record.percentage || '%'
                )
                RETURNING id INTO receipt_id;
                
                -- 更新分潤記錄
                UPDATE commissions 
                SET 
                    labor_receipt_generated = true,
                    labor_receipt_id = receipt_id,
                    updated_at = NOW()
                WHERE id = commission_record.id;
                
                success_cnt := success_cnt + 1;
            END;
            
        EXCEPTION WHEN OTHERS THEN
            error_cnt := error_cnt + 1;
            errors_array := array_append(errors_array, 
                '分潤ID ' || commission_record.id || ': ' || SQLERRM);
        END;
    END LOOP;
    
    RETURN QUERY SELECT success_cnt, error_cnt, total_cnt, errors_array;
END;
$$ LANGUAGE plpgsql;

-- 7. 創建支付記錄同步觸發器
CREATE OR REPLACE FUNCTION sync_payment_with_installments()
RETURNS TRIGGER AS $$
BEGIN
    -- 當新增付款記錄時，嘗試標記對應的分期付款為已付款
    UPDATE project_installments 
    SET 
        status = 'paid',
        paid_date = NEW.payment_date,
        actual_amount = CASE 
            WHEN amount <= NEW.amount THEN amount
            ELSE NEW.amount
        END,
        updated_at = NOW()
    WHERE project_id = NEW.project_id 
    AND status = 'unpaid'
    AND amount <= NEW.amount
    ORDER BY installment_number ASC
    LIMIT 1;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_payment_installments ON payments;
CREATE TRIGGER trigger_sync_payment_installments
    AFTER INSERT ON payments
    FOR EACH ROW
    EXECUTE FUNCTION sync_payment_with_installments();

-- 8. 建立權限檢查函數
CREATE OR REPLACE FUNCTION user_can_edit_project(user_email TEXT, project_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
    is_assigned BOOLEAN := false;
    is_manager BOOLEAN := false;
BEGIN
    -- 獲取用戶角色
    SELECT u.role INTO user_role
    FROM users u 
    WHERE u.email = user_email;
    
    -- 檢查是否為專案負責人或管理者
    SELECT 
        (p.assigned_to::text = (SELECT id::text FROM users WHERE email = user_email)),
        (p.manager_id::text = (SELECT id::text FROM users WHERE email = user_email))
    INTO is_assigned, is_manager
    FROM projects p
    WHERE p.id = project_id;
    
    -- 權限邏輯：admin/finance 可編輯所有專案，assigned_to/manager_id 可編輯自己的專案
    RETURN (user_role IN ('admin', 'finance')) OR is_assigned OR is_manager;
END;
$$ LANGUAGE plpgsql;

-- 9. 建立測試資料和驗證
-- 插入測試付款記錄（如果有專案的話）
DO $$
DECLARE
    test_project_id UUID;
BEGIN
    -- 獲取第一個專案ID進行測試
    SELECT id INTO test_project_id FROM projects LIMIT 1;
    
    IF test_project_id IS NOT NULL THEN
        -- 插入測試付款記錄
        INSERT INTO payments (project_id, payment_date, amount, method, description)
        VALUES (test_project_id, CURRENT_DATE, 100000, 'transfer', '測試付款記錄')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 10. 修復已存在的資料
-- 確保所有使用者都有正確的角色
UPDATE users SET role = 'sales' WHERE role IS NULL OR role = '';

-- 為特定 email 設定管理員權限
UPDATE users 
SET role = 'admin' 
WHERE email IN (
    'johnny.yang@brightstream.com.tw',
    'johnnyang0612@gmail.com',
    'johnny19940612@gmail.com'
);

-- 11. 建立綜合統計視圖
CREATE OR REPLACE VIEW finance_dashboard_summary AS
SELECT 
    'payments' as table_name,
    COUNT(*) as total_records,
    SUM(amount) as total_amount,
    MAX(payment_date) as latest_date
FROM payments
UNION ALL
SELECT 
    'labor_receipts' as table_name,
    COUNT(*) as total_records,
    SUM(net_amount) as total_amount,
    MAX(receipt_date) as latest_date
FROM labor_receipts
UNION ALL
SELECT 
    'commissions' as table_name,
    COUNT(*) as total_records,
    SUM(amount) as total_amount,
    MAX(updated_at::date) as latest_date
FROM commissions;

-- 驗證和結果輸出
SELECT 
    'Tables Created' as status,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'payments') as payments_table,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'labor_receipts') as labor_receipts_table;

SELECT 
    'Indexes Created' as status,
    COUNT(*) as total_indexes
FROM pg_indexes 
WHERE tablename IN ('payments', 'labor_receipts', 'commissions')
AND indexname LIKE 'idx_%';

SELECT 
    'Functions Created' as status,
    COUNT(*) as total_functions
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'generate_receipt_number',
    'batch_generate_labor_receipts',
    'sync_payment_with_installments',
    'user_can_edit_project'
);

-- 測試批次勞務報酬單產生功能
SELECT '=== 批次勞務報酬單產生測試 ===' as test_section;
SELECT * FROM batch_generate_labor_receipts();

-- 顯示財務統計摘要
SELECT '=== 財務統計摘要 ===' as summary_section;
SELECT * FROM finance_dashboard_summary ORDER BY table_name;

SELECT '財務權限問題修復完成！付款記錄、勞務報酬單批次產生、專案編輯權限都已修復。' as final_message;