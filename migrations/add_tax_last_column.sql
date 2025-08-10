-- Safe migration script - checks for existing columns/tables before creating

-- Function to safely add columns if they don't exist
DO $$ 
BEGIN
    -- Add project_name column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'project_name') THEN
        ALTER TABLE projects ADD COLUMN project_name TEXT;
    END IF;
    
    -- Add contact_person column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'contact_person') THEN
        ALTER TABLE projects ADD COLUMN contact_person TEXT;
    END IF;
    
    -- Add contact_phone column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'contact_phone') THEN
        ALTER TABLE projects ADD COLUMN contact_phone TEXT;
    END IF;
    
    -- Add contact_email column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'contact_email') THEN
        ALTER TABLE projects ADD COLUMN contact_email TEXT;
    END IF;
    
    -- Add tax_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'tax_id') THEN
        ALTER TABLE projects ADD COLUMN tax_id TEXT;
    END IF;
    
    -- Add sign_date column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'sign_date') THEN
        ALTER TABLE projects ADD COLUMN sign_date DATE;
    END IF;
    
    -- Add first_payment_date column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'first_payment_date') THEN
        ALTER TABLE projects ADD COLUMN first_payment_date DATE;
    END IF;
    
    -- Add expected_completion_date column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'expected_completion_date') THEN
        ALTER TABLE projects ADD COLUMN expected_completion_date DATE;
    END IF;
    
    -- Add tax_last column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'tax_last') THEN
        ALTER TABLE projects ADD COLUMN tax_last BOOLEAN DEFAULT false;
    END IF;
    
    -- Add warranty_period column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'warranty_period') THEN
        ALTER TABLE projects ADD COLUMN warranty_period INTEGER;
    END IF;
    
    -- Add actual_completion_date column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'actual_completion_date') THEN
        ALTER TABLE projects ADD COLUMN actual_completion_date DATE;
    END IF;
    
    -- Add maintenance_start_date column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'maintenance_start_date') THEN
        ALTER TABLE projects ADD COLUMN maintenance_start_date DATE;
    END IF;
    
    -- Add maintenance_billing_date column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'maintenance_billing_date') THEN
        ALTER TABLE projects ADD COLUMN maintenance_billing_date DATE;
    END IF;
    
    -- Add maintenance_fee column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'maintenance_fee') THEN
        ALTER TABLE projects ADD COLUMN maintenance_fee NUMERIC;
    END IF;
END $$;

-- Create project_installments table if it doesn't exist
CREATE TABLE IF NOT EXISTS project_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    actual_amount NUMERIC,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
    payment_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add installment-related columns if they don't exist
DO $$
BEGIN
    -- Add actual_amount column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_installments' AND column_name = 'actual_amount') THEN
        ALTER TABLE project_installments ADD COLUMN actual_amount NUMERIC;
    END IF;
    
    -- Add commission_amount column if it doesn't exist (應撥分潤)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_installments' AND column_name = 'commission_amount') THEN
        ALTER TABLE project_installments ADD COLUMN commission_amount NUMERIC;
    END IF;
    
    -- Add actual_commission column if it doesn't exist (實撥分潤)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_installments' AND column_name = 'actual_commission') THEN
        ALTER TABLE project_installments ADD COLUMN actual_commission NUMERIC;
    END IF;
    
    -- Add commission_payment_date column if it doesn't exist (實際撥款日)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_installments' AND column_name = 'commission_payment_date') THEN
        ALTER TABLE project_installments ADD COLUMN commission_payment_date DATE;
    END IF;
    
    -- Add commission_status column if it doesn't exist (撥款狀態)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_installments' AND column_name = 'commission_status') THEN
        ALTER TABLE project_installments ADD COLUMN commission_status TEXT DEFAULT 'pending' CHECK (commission_status IN ('pending', 'paid', 'partial'));
    END IF;
END $$;

-- Add user fields if they don't exist
DO $$ 
BEGIN
    -- Add phone column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
        ALTER TABLE users ADD COLUMN phone TEXT;
    END IF;
    
    -- Add supervisor_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'supervisor_id') THEN
        ALTER TABLE users ADD COLUMN supervisor_id UUID REFERENCES users(id);
    END IF;
    
    -- Add bank account fields if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bank_name') THEN
        ALTER TABLE users ADD COLUMN bank_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bank_code') THEN
        ALTER TABLE users ADD COLUMN bank_code TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account_number') THEN
        ALTER TABLE users ADD COLUMN account_number TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account_name') THEN
        ALTER TABLE users ADD COLUMN account_name TEXT;
    END IF;
END $$;

-- Create commission_payments table if it doesn't exist
CREATE TABLE IF NOT EXISTS commission_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    commission_id UUID REFERENCES commissions(id),
    amount NUMERIC NOT NULL,
    payment_date DATE NOT NULL,
    method TEXT DEFAULT 'transfer',
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create project_change_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS project_change_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT NOT NULL,
    change_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on project_installments if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_project_installments_project_id') THEN
        CREATE INDEX idx_project_installments_project_id ON project_installments(project_id);
    END IF;
END $$;

-- Update existing records to have tax_last as false (safe update)
UPDATE projects 
SET tax_last = false 
WHERE tax_last IS NULL;

-- Generate installments for existing projects that don't have any
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
BEGIN
    FOR project_record IN 
        SELECT * FROM projects 
        WHERE id NOT IN (SELECT DISTINCT project_id FROM project_installments WHERE project_id IS NOT NULL)
        AND payment_template IS NOT NULL 
        AND amount IS NOT NULL
    LOOP
        -- Parse payment template (default to '6/4' if invalid)
        IF project_record.payment_template = '10' OR project_record.payment_template = '' THEN
            ratios := ARRAY[10];
        ELSIF project_record.payment_template = '6/4' THEN
            ratios := ARRAY[6, 4];
        ELSIF project_record.payment_template = '6/2/2' THEN
            ratios := ARRAY[6, 2, 2];
        ELSIF project_record.payment_template = '3/2/3/2' THEN
            ratios := ARRAY[3, 2, 3, 2];
        ELSE
            -- Try to parse custom template like '5/3/2'
            BEGIN
                ratios := string_to_array(project_record.payment_template, '/')::INTEGER[];
            EXCEPTION
                WHEN OTHERS THEN
                    ratios := ARRAY[6, 4]; -- fallback
            END;
        END IF;
        
        total_ratio := 0;
        FOREACH ratio IN ARRAY ratios LOOP
            total_ratio := total_ratio + ratio;
        END LOOP;
        
        tax_amount := project_record.amount * 0.05;
        total_amount := project_record.amount + tax_amount;
        
        -- Calculate commission percentage
        commission_percentage := 0;
        IF project_record.type = 'new' THEN
            IF project_record.amount <= 100000 THEN
                commission_percentage := 35;
            ELSIF project_record.amount <= 300000 THEN
                commission_percentage := 30;
            ELSIF project_record.amount <= 600000 THEN
                commission_percentage := 25;
            ELSIF project_record.amount <= 1000000 THEN
                commission_percentage := 20;
            ELSE
                commission_percentage := 10;
            END IF;
        ELSIF project_record.type = 'renewal' THEN
            commission_percentage := 15;
        END IF;
        
        total_commission_amount := (project_record.amount * commission_percentage) / 100;
        commission_per_installment := total_commission_amount / array_length(ratios, 1);
        
        -- Create commission record if doesn't exist
        IF commission_percentage > 0 AND project_record.assigned_to IS NOT NULL THEN
            INSERT INTO commissions (project_id, user_id, percentage, amount, status)
            VALUES (project_record.id, project_record.assigned_to, commission_percentage, total_commission_amount, 'pending')
            ON CONFLICT DO NOTHING;
        END IF;
        
        -- Generate installments
        payment_date := COALESCE(project_record.first_payment_date, project_record.sign_date, CURRENT_DATE);
        
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
            
            -- Next installment date (add 1 month)
            payment_date := payment_date + INTERVAL '1 month';
        END LOOP;
        
        RAISE NOTICE 'Generated % installments for project %', array_length(ratios, 1), project_record.project_code;
    END LOOP;
END $$;