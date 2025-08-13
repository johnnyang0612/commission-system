-- 為 project_costs 表添加 file_attachments 欄位

-- 檢查欄位是否已存在
DO $$ 
BEGIN
    -- 添加 file_attachments 欄位（用於存儲上傳文件的 JSON 數據）
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_costs' AND column_name = 'file_attachments'
    ) THEN
        ALTER TABLE project_costs ADD COLUMN file_attachments TEXT;
        
        RAISE NOTICE 'Added file_attachments column to project_costs table';
    ELSE
        RAISE NOTICE 'file_attachments column already exists in project_costs table';
    END IF;

    -- 檢查並添加其他可能缺失的欄位
    
    -- supplier_name 欄位
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_costs' AND column_name = 'supplier_name'
    ) THEN
        ALTER TABLE project_costs ADD COLUMN supplier_name VARCHAR(200);
        RAISE NOTICE 'Added supplier_name column to project_costs table';
    END IF;

    -- invoice_number 欄位
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_costs' AND column_name = 'invoice_number'
    ) THEN
        ALTER TABLE project_costs ADD COLUMN invoice_number VARCHAR(100);
        RAISE NOTICE 'Added invoice_number column to project_costs table';
    END IF;

    -- invoice_date 欄位
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_costs' AND column_name = 'invoice_date'
    ) THEN
        ALTER TABLE project_costs ADD COLUMN invoice_date DATE;
        RAISE NOTICE 'Added invoice_date column to project_costs table';
    END IF;

    -- tax_amount 欄位
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_costs' AND column_name = 'tax_amount'
    ) THEN
        ALTER TABLE project_costs ADD COLUMN tax_amount NUMERIC(12,2) DEFAULT 0;
        RAISE NOTICE 'Added tax_amount column to project_costs table';
    END IF;

    -- net_amount 欄位
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_costs' AND column_name = 'net_amount'
    ) THEN
        ALTER TABLE project_costs ADD COLUMN net_amount NUMERIC(12,2) DEFAULT 0;
        RAISE NOTICE 'Added net_amount column to project_costs table';
    END IF;

    -- approval_status 欄位
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_costs' AND column_name = 'approval_status'
    ) THEN
        ALTER TABLE project_costs ADD COLUMN approval_status VARCHAR(50) DEFAULT 'pending';
        RAISE NOTICE 'Added approval_status column to project_costs table';
    END IF;

    -- is_paid 欄位
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'project_costs' AND column_name = 'is_paid'
    ) THEN
        ALTER TABLE project_costs ADD COLUMN is_paid BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added is_paid column to project_costs table';
    END IF;

END $$;

-- 檢查結果
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'project_costs' 
ORDER BY ordinal_position;