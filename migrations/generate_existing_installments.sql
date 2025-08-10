-- Generate installments for existing projects
DO $$
DECLARE
    project_record RECORD;
    ratios INTEGER[];
    total_ratio INTEGER;
    tax_amount NUMERIC;
    total_amount NUMERIC;
    commission_percentage NUMERIC;
    total_commission_amount NUMERIC;
    commission_per_installment NUMERIC;
    installment_amount NUMERIC;
    base_installment_amount NUMERIC;
    payment_date DATE;
    i INTEGER;
    ratio INTEGER;
    template_parts TEXT[];
BEGIN
    FOR project_record IN 
        SELECT * FROM projects 
        WHERE id NOT IN (SELECT DISTINCT project_id FROM project_installments WHERE project_id IS NOT NULL)
        AND payment_template IS NOT NULL 
        AND amount IS NOT NULL
        AND amount > 0
    LOOP
        RAISE NOTICE 'Processing project: % with template: %', project_record.project_code, project_record.payment_template;
        
        -- Parse payment template dynamically
        BEGIN
            IF project_record.payment_template = '10' THEN
                ratios := ARRAY[10];
            ELSE
                -- Split by '/' and convert to integer array
                template_parts := string_to_array(project_record.payment_template, '/');
                ratios := ARRAY[]::INTEGER[];
                
                FOR i IN 1..array_length(template_parts, 1) LOOP
                    IF template_parts[i] ~ '^[0-9]+$' THEN
                        ratios := ratios || ARRAY[template_parts[i]::INTEGER];
                    END IF;
                END LOOP;
                
                -- If parsing failed, use default
                IF array_length(ratios, 1) IS NULL OR array_length(ratios, 1) = 0 THEN
                    ratios := ARRAY[6, 4];
                END IF;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Failed to parse template %, using default 6/4', project_record.payment_template;
                ratios := ARRAY[6, 4];
        END;
        
        RAISE NOTICE 'Using ratios: %', ratios;
        
        total_ratio := 0;
        FOREACH ratio IN ARRAY ratios LOOP
            total_ratio := total_ratio + ratio;
        END LOOP;
        
        tax_amount := project_record.amount * 0.05;
        total_amount := project_record.amount + tax_amount;
        
        -- 階梯式分潤計算
        total_commission_amount := 0;
        commission_percentage := 0;
        
        IF project_record.type = 'new' THEN
            DECLARE
                remaining_amount NUMERIC := project_record.amount;
                tier_amount NUMERIC;
            BEGIN
                -- 第一階：10萬以下 35%
                IF remaining_amount > 0 THEN
                    tier_amount := LEAST(remaining_amount, 100000);
                    total_commission_amount := total_commission_amount + (tier_amount * 0.35);
                    remaining_amount := remaining_amount - tier_amount;
                END IF;
                
                -- 第二階：10-30萬 30%
                IF remaining_amount > 0 THEN
                    tier_amount := LEAST(remaining_amount, 200000);
                    total_commission_amount := total_commission_amount + (tier_amount * 0.30);
                    remaining_amount := remaining_amount - tier_amount;
                END IF;
                
                -- 第三階：30-60萬 25%
                IF remaining_amount > 0 THEN
                    tier_amount := LEAST(remaining_amount, 300000);
                    total_commission_amount := total_commission_amount + (tier_amount * 0.25);
                    remaining_amount := remaining_amount - tier_amount;
                END IF;
                
                -- 第四階：60-100萬 20%
                IF remaining_amount > 0 THEN
                    tier_amount := LEAST(remaining_amount, 400000);
                    total_commission_amount := total_commission_amount + (tier_amount * 0.20);
                    remaining_amount := remaining_amount - tier_amount;
                END IF;
                
                -- 第五階：100萬以上 10%
                IF remaining_amount > 0 THEN
                    total_commission_amount := total_commission_amount + (remaining_amount * 0.10);
                END IF;
                
                commission_percentage := (total_commission_amount / project_record.amount) * 100;
            END;
        ELSIF project_record.type = 'renewal' THEN
            total_commission_amount := project_record.amount * 0.15;
            commission_percentage := 15;
        END IF;
        commission_per_installment := total_commission_amount / array_length(ratios, 1);
        
        RAISE NOTICE 'Commission: % percent = NT$ %', commission_percentage, total_commission_amount;
        
        -- Create commission record if doesn't exist and has assigned user
        IF commission_percentage > 0 AND project_record.assigned_to IS NOT NULL THEN
            BEGIN
                INSERT INTO commissions (project_id, user_id, percentage, amount, status)
                VALUES (project_record.id, project_record.assigned_to, commission_percentage, total_commission_amount, 'pending');
                RAISE NOTICE 'Created commission record';
            EXCEPTION
                WHEN unique_violation THEN
                    RAISE NOTICE 'Commission record already exists';
                WHEN OTHERS THEN
                    RAISE NOTICE 'Failed to create commission record: %', SQLERRM;
            END;
        END IF;
        
        -- Set payment start date
        payment_date := COALESCE(project_record.first_payment_date, project_record.sign_date, CURRENT_DATE);
        
        -- Generate installments
        FOR i IN 1..array_length(ratios, 1) LOOP
            ratio := ratios[i];
            
            IF COALESCE(project_record.tax_last, false) THEN
                -- Tax paid with last installment
                base_installment_amount := (project_record.amount * ratio) / total_ratio;
                IF i = array_length(ratios, 1) THEN
                    installment_amount := base_installment_amount + tax_amount;
                ELSE
                    installment_amount := base_installment_amount;
                END IF;
            ELSE
                -- Tax distributed across installments
                installment_amount := (total_amount * ratio) / total_ratio;
            END IF;
            
            BEGIN
                INSERT INTO project_installments (
                    project_id, 
                    installment_number, 
                    due_date, 
                    amount, 
                    commission_amount,
                    commission_status,
                    status
                ) VALUES (
                    project_record.id,
                    i,
                    payment_date,
                    ROUND(installment_amount),
                    ROUND(commission_per_installment),
                    'pending',
                    'pending'
                );
                
                RAISE NOTICE 'Created installment %: NT$ %', i, ROUND(installment_amount);
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE NOTICE 'Failed to create installment %: %', i, SQLERRM;
            END;
            
            -- Next installment date (add 1 month)
            payment_date := payment_date + INTERVAL '1 month';
        END LOOP;
        
        RAISE NOTICE 'Generated % installments for project %', array_length(ratios, 1), project_record.project_code;
        RAISE NOTICE '----------------------------------------';
    END LOOP;
END $$;