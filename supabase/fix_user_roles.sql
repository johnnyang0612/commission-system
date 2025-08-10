-- 修正用戶角色系統
-- 1. 更新現有觸發器，新用戶預設為 'sales' 角色

-- 刪除舊的觸發器和函數
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 創建新的用戶同步函數
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, created_at, updated_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'sales', -- 預設為業務角色
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, users.name),
    updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 創建觸發器
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- 2. 設置您的管理員帳號（請替換為您的實際 email）
-- 這裡假設您是第一個用戶或特定 email
UPDATE public.users 
SET role = 'admin' 
WHERE email = 'johnnyang0612@gmail.com' -- 請替換為您的 email
   OR email = 'admin@chuanhuikeji.com'; -- 或公司管理員 email

-- 3. 確保所有其他用戶預設為 sales
UPDATE public.users 
SET role = 'sales' 
WHERE role IS NULL 
   OR role = ''
   OR (role = 'admin' AND email NOT IN ('johnnyang0612@gmail.com', 'admin@chuanhuikeji.com'));

-- 4. 查看當前用戶角色分配
SELECT id, email, name, role FROM public.users ORDER BY created_at;