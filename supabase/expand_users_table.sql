-- 擴充 users 表，新增勞務報酬單需要的欄位
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(20); -- 身分證號
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE; -- 出生日期
ALTER TABLE users ADD COLUMN IF NOT EXISTS registered_address TEXT; -- 戶籍地址
ALTER TABLE users ADD COLUMN IF NOT EXISTS mailing_address TEXT; -- 通訊地址
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_id_number VARCHAR(20); -- 稅籍編號

-- 銀行資訊 (原本就有，確保存在)
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100); -- 銀行名稱
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_code VARCHAR(10); -- 銀行代碼  
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_number VARCHAR(50); -- 帳號
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_name VARCHAR(100); -- 戶名

-- 其他個人資訊
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20); -- 電話號碼
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20); -- 手機號碼
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100); -- 緊急聯絡人
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20); -- 緊急聯絡人電話
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(100); -- 職稱
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100); -- 部門

-- 勞務報酬相關
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_exemption_amount DECIMAL(10,2) DEFAULT 0; -- 免稅額
ALTER TABLE users ADD COLUMN IF NOT EXISTS withholding_tax_rate DECIMAL(5,2) DEFAULT 10.00; -- 扣繳率
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_insurance_fee DECIMAL(10,2) DEFAULT 0; -- 健保費
ALTER TABLE users ADD COLUMN IF NOT EXISTS labor_insurance_fee DECIMAL(10,2) DEFAULT 0; -- 勞保費

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_users_national_id ON users(national_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);

-- 更新現有使用者的預設值
UPDATE users SET 
  withholding_tax_rate = 10.00,
  tax_exemption_amount = 0,
  health_insurance_fee = 0,
  labor_insurance_fee = 0
WHERE withholding_tax_rate IS NULL OR tax_exemption_amount IS NULL;