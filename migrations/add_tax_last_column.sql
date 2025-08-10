-- Add new columns to projects table
ALTER TABLE projects 
ADD COLUMN project_name TEXT,
ADD COLUMN contact_person TEXT,
ADD COLUMN contact_phone TEXT,
ADD COLUMN contact_email TEXT,
ADD COLUMN tax_id TEXT,
ADD COLUMN sign_date DATE,
ADD COLUMN first_payment_date DATE,
ADD COLUMN expected_completion_date DATE,
ADD COLUMN tax_last BOOLEAN DEFAULT false,
ADD COLUMN warranty_period INTEGER,
ADD COLUMN actual_completion_date DATE,
ADD COLUMN maintenance_start_date DATE,
ADD COLUMN maintenance_billing_date DATE,
ADD COLUMN maintenance_fee NUMERIC;

-- Create project_installments table
CREATE TABLE project_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
    payment_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on project_installments
CREATE INDEX idx_project_installments_project_id ON project_installments(project_id);

-- Update existing records to have tax_last as false
UPDATE projects 
SET tax_last = false 
WHERE tax_last IS NULL;