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
ADD COLUMN tax_last BOOLEAN DEFAULT false;

-- Update existing records to have tax_last as false
UPDATE projects 
SET tax_last = false 
WHERE tax_last IS NULL;