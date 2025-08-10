-- Add fixed commission fields to projects table
DO $$ 
BEGIN
    -- Add use_fixed_commission column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'use_fixed_commission') THEN
        ALTER TABLE projects ADD COLUMN use_fixed_commission BOOLEAN DEFAULT false;
    END IF;
    
    -- Add fixed_commission_percentage column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'fixed_commission_percentage') THEN
        ALTER TABLE projects ADD COLUMN fixed_commission_percentage NUMERIC;
    END IF;
END $$;