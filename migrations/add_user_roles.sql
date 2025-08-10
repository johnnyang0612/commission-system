-- Update user roles to support admin and finance permissions
DO $$ 
BEGIN
    -- Check if the role column exists and update its constraint if needed
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
        -- Drop existing check constraint if it exists
        BEGIN
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
        EXCEPTION
            WHEN OTHERS THEN NULL;
        END;
        
        -- Add new check constraint with admin and finance roles
        ALTER TABLE users ADD CONSTRAINT users_role_check 
        CHECK (role IN ('admin', 'finance', 'sales', 'leader'));
        
        -- Update any existing 'leader' roles to 'admin' if needed
        -- (You can customize this based on your current data)
        UPDATE users SET role = 'admin' WHERE role = 'leader' AND email LIKE '%admin%';
        
    ELSE
        -- If role column doesn't exist, create it
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'sales' 
        CHECK (role IN ('admin', 'finance', 'sales', 'leader'));
    END IF;
    
    -- Create a default admin user if none exists (optional)
    INSERT INTO users (name, email, role, created_at)
    SELECT 'Admin User', 'admin@example.com', 'admin', CURRENT_TIMESTAMP
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');
    
    -- Create a default finance user if none exists (optional) 
    INSERT INTO users (name, email, role, created_at)
    SELECT 'Finance User', 'finance@example.com', 'finance', CURRENT_TIMESTAMP
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'finance');
    
END $$;