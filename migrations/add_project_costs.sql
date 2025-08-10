-- Create project costs table
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

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_project_costs_project_id ON project_costs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_costs_type ON project_costs(cost_type);
CREATE INDEX IF NOT EXISTS idx_project_costs_date ON project_costs(cost_date);