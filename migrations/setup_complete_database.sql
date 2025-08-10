-- Complete database setup for Commission System
-- Execute this in Supabase SQL Editor

-- 1. Create users table with roles
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    extension VARCHAR(10),
    birth_date DATE,
    id_number VARCHAR(20),
    bank_account VARCHAR(50),
    bank_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'sales' CHECK (role IN ('admin', 'finance', 'sales', 'leader')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create projects table
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    project_code VARCHAR(50) UNIQUE NOT NULL,
    client_name VARCHAR(100) NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    type VARCHAR(20) DEFAULT 'new' CHECK (type IN ('new', 'renewal', 'maintenance')),
    commission_type VARCHAR(20) DEFAULT 'tiered' CHECK (commission_type IN ('tiered', 'fixed')),
    fixed_commission_rate NUMERIC(5,2),
    payment_template VARCHAR(20) DEFAULT 'full' CHECK (payment_template IN ('full', '30_70', '50_50', '20_30_50', 'custom')),
    assigned_to INTEGER REFERENCES users(id),
    manager_id INTEGER REFERENCES users(id),
    warranty_start DATE,
    warranty_end DATE,
    maintenance_fee NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create project_installments table
CREATE TABLE IF NOT EXISTS project_installments (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'overdue')),
    paid_date DATE,
    actual_amount NUMERIC(12,2),
    commission_amount NUMERIC(12,2) DEFAULT 0,
    actual_commission NUMERIC(12,2),
    commission_payment_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create project_costs table
CREATE TABLE IF NOT EXISTS project_costs (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cost_type VARCHAR(100) NOT NULL,
    description TEXT,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    cost_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    notes TEXT
);

-- 5. Create payments table
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    method VARCHAR(20) DEFAULT 'transfer' CHECK (method IN ('transfer', 'check', 'cash', 'credit')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Create commissions table
CREATE TABLE IF NOT EXISTS commissions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_assigned_to ON projects(assigned_to);
CREATE INDEX IF NOT EXISTS idx_projects_manager_id ON projects(manager_id);
CREATE INDEX IF NOT EXISTS idx_project_installments_project_id ON project_installments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_installments_status ON project_installments(status);
CREATE INDEX IF NOT EXISTS idx_project_costs_project_id ON project_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_type ON project_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_project_costs_date ON project_costs(cost_date);
CREATE INDEX IF NOT EXISTS idx_payments_project_id ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_commissions_project_id ON commissions(project_id);
CREATE INDEX IF NOT EXISTS idx_commissions_user_id ON commissions(user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);

-- Insert default users if they don't exist
INSERT INTO users (name, email, role, created_at)
SELECT 'Admin User', 'admin@example.com', 'admin', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');

INSERT INTO users (name, email, role, created_at)
SELECT 'Finance User', 'finance@example.com', 'finance', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'finance');

-- Update any existing data to ensure consistency
UPDATE users SET role = 'sales' WHERE role IS NULL OR role = '';

-- Enable Row Level Security (RLS) if needed
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE project_costs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Add RLS policies (uncomment if using RLS)
-- CREATE POLICY "Users can view their own projects" ON projects
--   FOR SELECT USING (assigned_to = auth.uid() OR manager_id = auth.uid());

-- CREATE POLICY "Admin and Finance can view all projects" ON projects
--   FOR ALL USING (
--     EXISTS (
--       SELECT 1 FROM users 
--       WHERE id = auth.uid() 
--       AND role IN ('admin', 'finance')
--     )
--   );