-- 正確的 RLS 政策修復（避免循環引用）

-- 刪除所有現有的政策
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users; 
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Admin full access" ON users;
DROP POLICY IF EXISTS "Authenticated users can view all users" ON users;

-- 確保 RLS 已啟用
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 政策 1: 允許管理員查看所有用戶
CREATE POLICY "Admin can view all users" ON users
FOR SELECT
TO authenticated
USING (
  auth.email() IN (
    'johnny.yang@brightstream.com.tw',
    'johnnyang0612@gmail.com',
    'johnny19940612@gmail.com'
  )
);

-- 政策 2: 允許管理員新增用戶
CREATE POLICY "Admin can insert users" ON users
FOR INSERT
TO authenticated
WITH CHECK (
  auth.email() IN (
    'johnny.yang@brightstream.com.tw',
    'johnnyang0612@gmail.com',
    'johnny19940612@gmail.com'
  )
);

-- 政策 3: 允許管理員更新用戶
CREATE POLICY "Admin can update users" ON users
FOR UPDATE
TO authenticated
USING (
  auth.email() IN (
    'johnny.yang@brightstream.com.tw',
    'johnnyang0612@gmail.com',
    'johnny19940612@gmail.com'
  )
)
WITH CHECK (
  auth.email() IN (
    'johnny.yang@brightstream.com.tw',
    'johnnyang0612@gmail.com',
    'johnny19940612@gmail.com'
  )
);

-- 政策 4: 允許管理員刪除用戶
CREATE POLICY "Admin can delete users" ON users
FOR DELETE
TO authenticated
USING (
  auth.email() IN (
    'johnny.yang@brightstream.com.tw',
    'johnnyang0612@gmail.com',
    'johnny19940612@gmail.com'
  )
);

-- 政策 5: 允許用戶查看自己的資料
CREATE POLICY "Users can view own profile" ON users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 政策 6: 允許用戶更新自己的資料
CREATE POLICY "Users can update own profile" ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 驗證政策已創建
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY policyname;