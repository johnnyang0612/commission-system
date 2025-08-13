-- 簡單修復 RLS 政策（避免循環引用）

-- 刪除所有現有的政策
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Admin full access" ON users;
DROP POLICY IF EXISTS "Authenticated users can view all users" ON users;

-- 暫時禁用 RLS 以避免複雜的政策問題
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- 或者如果您想保留 RLS，使用簡單的政策：
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Allow all for authenticated users" ON users
-- FOR ALL
-- TO authenticated
-- USING (true)
-- WITH CHECK (true);