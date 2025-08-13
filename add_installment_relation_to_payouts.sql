-- 添加 related_installment_id 欄位到 commission_payouts 表
-- 用於關聯專案期數的撥款記錄

DO $$ 
BEGIN
    -- 檢查欄位是否已存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'commission_payouts' 
        AND column_name = 'related_installment_id'
    ) THEN
        -- 添加關聯期數的欄位
        ALTER TABLE commission_payouts 
        ADD COLUMN related_installment_id UUID,
        ADD CONSTRAINT fk_commission_payouts_installment 
            FOREIGN KEY (related_installment_id) 
            REFERENCES project_installments(id) 
            ON DELETE SET NULL;
            
        COMMENT ON COLUMN commission_payouts.related_installment_id IS '關聯的專案期數ID（如果撥款來自期數撥款）';
    END IF;
END $$;

-- 檢查結果
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'commission_payouts' 
AND column_name = 'related_installment_id';