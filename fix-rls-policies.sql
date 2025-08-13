-- 修復 users 表的 Row Level Security 政策
-- 這個腳本需要在 Supabase SQL 編輯器中執行

-- 首先檢查現有的 RLS 政策
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'users';

-- 刪除現有的限制性政策（如果存在）
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;

-- 為特定管理員 email 創建完全訪問政策（避免循環引用）
CREATE POLICY "Admin full access" ON users
FOR ALL
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

-- 允許所有已認證用戶查看用戶列表（用於下拉選單等）
CREATE POLICY "Authenticated users can view all users" ON users
FOR SELECT
TO authenticated
USING (true);

-- 允許用戶更新自己的資料
CREATE POLICY "Users can update own profile" ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 顯示更新後的政策
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'users';