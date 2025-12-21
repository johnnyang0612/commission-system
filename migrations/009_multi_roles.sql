-- 多角色支援
-- 一個用戶可以同時是 PM、Sales、Leader

-- 新增 roles 欄位（陣列）
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 將現有單一 role 遷移到 roles 陣列
UPDATE users SET roles = ARRAY[role] WHERE role IS NOT NULL AND (roles IS NULL OR array_length(roles, 1) IS NULL);

-- 建立索引以支援陣列查詢
CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN(roles);

-- 注意：保留 role 欄位作為「主要角色」或向後相容
COMMENT ON COLUMN users.role IS '主要角色（向後相容）';
COMMENT ON COLUMN users.roles IS '所有角色（陣列），可同時擁有多個角色';
