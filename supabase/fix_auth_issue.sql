-- 修復認證問題 - 安全版本
-- 請逐步執行，確認每步驟都成功

-- 1. 先檢查現有用戶資料
SELECT id, email, name, role FROM public.users;

-- 2. 檢查 auth.users 表中的用戶
SELECT id, email FROM auth.users;

-- 3. 刪除可能有問題的觸發器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- 4. 創建簡化版的觸發器函數
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS trigger AS $$
BEGIN
  -- 只在用戶不存在時插入
  INSERT INTO public.users (id, email, name, role, created_at, updated_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'sales',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING; -- 如果已存在，不做任何事
  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- 記錄錯誤但不中斷登入
    RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 重新創建觸發器
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- 6. 修復現有用戶資料（確保 auth.users 中的所有用戶都在 public.users 中）
INSERT INTO public.users (id, email, name, role, created_at, updated_at)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  'sales',
  COALESCE(au.created_at, now()),
  now()
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE pu.id IS NULL;

-- 7. 更新您的管理員角色（請替換為您的實際 email）
UPDATE public.users 
SET role = 'admin' 
WHERE email = 'johnnyang0612@gmail.com'; -- 替換為您的 email

-- 8. 驗證修復結果
SELECT 
  au.id,
  au.email as auth_email,
  pu.email as public_email,
  pu.name,
  pu.role
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id;