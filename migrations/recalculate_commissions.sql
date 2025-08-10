-- 重新計算所有專案的階梯式分潤
DO $$
DECLARE
    commission_record RECORD;
    project_record RECORD;
    total_commission_amount NUMERIC;
    commission_percentage NUMERIC;
    remaining_amount NUMERIC;
    tier_amount NUMERIC;
BEGIN
    -- 處理所有現有的分潤記錄
    FOR commission_record IN 
        SELECT c.*, p.amount, p.type 
        FROM commissions c 
        JOIN projects p ON c.project_id = p.id
        WHERE p.type = 'new'  -- 只處理新簽案件，因為續簽已經是正確的15%
    LOOP
        RAISE NOTICE 'Recalculating commission for project amount: %', commission_record.amount;
        
        -- 重新計算階梯式分潤
        total_commission_amount := 0;
        remaining_amount := commission_record.amount;
        
        -- 第一階：10萬以下 35%
        IF remaining_amount > 0 THEN
            tier_amount := LEAST(remaining_amount, 100000);
            total_commission_amount := total_commission_amount + (tier_amount * 0.35);
            remaining_amount := remaining_amount - tier_amount;
            RAISE NOTICE 'Tier 1 (35%%): NT$ %', tier_amount * 0.35;
        END IF;
        
        -- 第二階：10-30萬 30%
        IF remaining_amount > 0 THEN
            tier_amount := LEAST(remaining_amount, 200000);
            total_commission_amount := total_commission_amount + (tier_amount * 0.30);
            remaining_amount := remaining_amount - tier_amount;
            RAISE NOTICE 'Tier 2 (30%%): NT$ %', tier_amount * 0.30;
        END IF;
        
        -- 第三階：30-60萬 25%
        IF remaining_amount > 0 THEN
            tier_amount := LEAST(remaining_amount, 300000);
            total_commission_amount := total_commission_amount + (tier_amount * 0.25);
            remaining_amount := remaining_amount - tier_amount;
            RAISE NOTICE 'Tier 3 (25%%): NT$ %', tier_amount * 0.25;
        END IF;
        
        -- 第四階：60-100萬 20%
        IF remaining_amount > 0 THEN
            tier_amount := LEAST(remaining_amount, 400000);
            total_commission_amount := total_commission_amount + (tier_amount * 0.20);
            remaining_amount := remaining_amount - tier_amount;
            RAISE NOTICE 'Tier 4 (20%%): NT$ %', tier_amount * 0.20;
        END IF;
        
        -- 第五階：100萬以上 10%
        IF remaining_amount > 0 THEN
            total_commission_amount := total_commission_amount + (remaining_amount * 0.10);
            RAISE NOTICE 'Tier 5 (10%%): NT$ %', remaining_amount * 0.10;
        END IF;
        
        commission_percentage := (total_commission_amount / commission_record.amount) * 100;
        
        RAISE NOTICE 'Old commission: NT$ % (% percent)', commission_record.amount, commission_record.percentage;
        RAISE NOTICE 'New commission: NT$ % (% percent)', total_commission_amount, commission_percentage;
        
        -- 更新分潤記錄
        UPDATE commissions 
        SET 
            amount = total_commission_amount,
            percentage = commission_percentage
        WHERE id = commission_record.id;
        
        -- 更新相關的期數分潤金額
        UPDATE project_installments 
        SET commission_amount = ROUND(total_commission_amount / (
            SELECT COUNT(*) FROM project_installments WHERE project_id = commission_record.project_id
        ))
        WHERE project_id = commission_record.project_id;
        
        RAISE NOTICE 'Updated commission record for project %', commission_record.project_id;
        RAISE NOTICE '----------------------------------------';
    END LOOP;
    
    RAISE NOTICE 'Commission recalculation completed!';
END $$;