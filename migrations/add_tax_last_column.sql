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

-- Add actual_amount column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_installments' AND column_name = 'actual_amount') THEN
        ALTER TABLE project_installments ADD COLUMN actual_amount NUMERIC;
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