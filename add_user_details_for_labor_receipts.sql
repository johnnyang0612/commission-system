-- 為 users 表添加勞務報酬單所需的欄位

-- 添加新欄位
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS id_number VARCHAR(20), -- 身分證字號
ADD COLUMN IF NOT EXISTS address TEXT,          -- 地址
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),     -- 電話
ADD COLUMN IF NOT EXISTS birth_date DATE,       -- 生日
ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50), -- 銀行帳號
ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);   -- 銀行名稱

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_users_id_number ON users(id_number);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- 檢查結果
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('id_number', 'address', 'phone', 'birth_date', 'bank_account', 'bank_name')
ORDER BY column_name;