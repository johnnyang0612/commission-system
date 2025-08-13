-- 最終 RLS 政策修復（直接且簡單）

-- 先禁用 RLS 清理所有政策
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 刪除所有現有政策
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users; 
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Admin full access" ON users;
DROP POLICY IF EXISTS "Authenticated users can view all users" ON users;
DROP POLICY IF EXISTS "Admin can view all users" ON users;
DROP POLICY IF EXISTS "Admin can insert users" ON users;
DROP POLICY IF EXISTS "Admin can update users" ON users;
DROP POLICY IF EXISTS "Admin can delete users" ON users;

-- 重新啟用 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 創建簡單有效的政策 - 允許您的帳號完全訪問
CREATE POLICY "Johnny full access" ON users
FOR ALL
TO authenticated
USING (
  (SELECT auth.email()) = 'johnny.yang@brightstream.com.tw'
  OR (SELECT auth.email()) = 'johnnyang0612@gmail.com'
  OR (SELECT auth.email()) = 'johnny19940612@gmail.com'
  OR auth.uid() = id  -- 允許用戶查看自己的資料
)
WITH CHECK (
  (SELECT auth.email()) = 'johnny.yang@brightstream.com.tw'
  OR (SELECT auth.email()) = 'johnnyang0612@gmail.com'
  OR (SELECT auth.email()) = 'johnny19940612@gmail.com'
);

-- 檢查結果
SELECT * FROM pg_policies WHERE tablename = 'users';

-- 測試查詢
SELECT auth.email() as current_email;
SELECT count(*) as user_count FROM users;