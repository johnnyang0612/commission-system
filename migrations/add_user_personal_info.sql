-- Add personal information fields to users table
DO $$ 
BEGIN
    -- Add full_name column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'full_name') THEN
        ALTER TABLE users ADD COLUMN full_name VARCHAR(100);
    END IF;
    
    -- Add phone column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'phone') THEN
        ALTER TABLE users ADD COLUMN phone VARCHAR(20);
    END IF;
    
    -- Add extension column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'extension') THEN
        ALTER TABLE users ADD COLUMN extension VARCHAR(10);
    END IF;
    
    -- Add bank_name column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bank_name') THEN
        ALTER TABLE users ADD COLUMN bank_name VARCHAR(100);
    END IF;
    
    -- Add bank_code column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bank_code') THEN
        ALTER TABLE users ADD COLUMN bank_code VARCHAR(10);
    END IF;
    
    -- Add bank_account column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bank_account') THEN
        ALTER TABLE users ADD COLUMN bank_account VARCHAR(20);
    END IF;
    
    -- Add bank_branch column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'bank_branch') THEN
        ALTER TABLE users ADD COLUMN bank_branch VARCHAR(100);
    END IF;
    
END $$;