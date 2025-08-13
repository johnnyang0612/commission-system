-- 更寬鬆的 RLS 政策修復

-- 刪除現有政策
DROP POLICY IF EXISTS "Johnny full access" ON users;

-- 暫時禁用 RLS 測試
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 手動插入測試用戶來驗證（請將 email 改成實際的）
-- INSERT INTO users (id, email, name, role, created_at) 
-- VALUES ('temp-google-user', 'a09206137@gmail.com', 'Google用戶', 'sales', NOW())
-- ON CONFLICT (id) DO NOTHING;

-- 重新啟用 RLS 並設置更寬鬆的政策
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 政策1：允許認證用戶查看所有用戶（用於用戶管理頁面）
CREATE POLICY "Authenticated users can view all" ON users
FOR SELECT
TO authenticated
USING (true);

-- 政策2：允許管理員進行所有操作
CREATE POLICY "Admin full control" ON users
FOR ALL
TO authenticated
USING (
  auth.email() = 'johnny.yang@brightstream.com.tw'
  OR auth.email() = 'johnnyang0612@gmail.com'
  OR auth.email() = 'johnny19940612@gmail.com'
)
WITH CHECK (
  auth.email() = 'johnny.yang@brightstream.com.tw'
  OR auth.email() = 'johnnyang0612@gmail.com'
  OR auth.email() = 'johnny19940612@gmail.com'
);

-- 政策3：允許系統自動創建新用戶（當用戶首次登入時）
CREATE POLICY "Allow user self creation" ON users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 政策4：允許用戶更新自己的資料
CREATE POLICY "Users can update self" ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 驗證政策
SELECT policyname, cmd, permissive FROM pg_policies WHERE tablename = 'users';