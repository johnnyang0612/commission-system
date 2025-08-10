# Google OAuth 設置修復指南

## 重要：先在 Supabase Dashboard 確認設置

### 步驟 1: 登入 Supabase Dashboard
1. 前往 https://supabase.com/dashboard
2. 選擇您的專案 (zpkjncfhplxsuginuzyg)

### 步驟 2: 檢查 Authentication 設置
1. 點選左側選單的 **Authentication**
2. 點選 **Providers** 分頁
3. 找到 **Google** 並確認是否已啟用

### 步驟 3: 取得正確的回調 URL
在 Google Provider 設置中，您會看到一個回調 URL，格式如下：
```
https://zpkjncfhplxsuginuzyg.supabase.co/auth/v1/callback
```
複製這個 URL，您需要在 Google Console 中使用。

### 步驟 4: 設置 Google Cloud Console

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 選擇或創建專案
3. 前往 **APIs & Services > Credentials**
4. 點選您的 OAuth 2.0 Client ID 或創建新的
5. 在 **Authorized redirect URIs** 中加入：
   - `https://zpkjncfhplxsuginuzyg.supabase.co/auth/v1/callback`
   - 您的 Vercel 網址（例如：`https://您的專案.vercel.app`）
   - `http://localhost:3000` （用於本地測試）

### 步驟 5: 在 Supabase 中設置 Google 憑證
1. 回到 Supabase Dashboard > Authentication > Providers
2. 在 Google 設置中輸入：
   - **Client ID**: 從 Google Console 複製
   - **Client Secret**: 從 Google Console 複製
3. 點選 **Save**

### 步驟 6: 更新網站設置

在 Vercel 環境變數中確認有以下設置：
- `NEXT_PUBLIC_SUPABASE_URL=https://zpkjncfhplxsuginuzyg.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=您的 anon key`

### 步驟 7: 測試登入流程

1. 訪問您的網站 `/login` 頁面
2. 點擊「使用 Google 登入」
3. 應該會跳轉到 Google 登入頁面
4. 選擇帳號後會自動返回您的網站

## 常見問題排查

### 問題 1: 無限重定向
- 確認 Google Console 中的回調 URL 完全正確
- 檢查 Supabase Dashboard 中的 Site URL 設置（Settings > Authentication）

### 問題 2: Database error saving new user
這個錯誤通常是因為 users 表的觸發器問題。執行以下 SQL：

```sql
-- 刪除舊的觸發器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 創建新的函數
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, created_at, updated_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'sales',
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
```

### 問題 3: 403 Forbidden
- 確認您的 Google Workspace 允許外部應用程式存取
- 檢查 OAuth 同意畫面設置是否正確

## 驗證設置

訪問以下網址測試：
1. 演示登入（備用）：點擊綠色「演示登入」按鈕
2. Google 登入：點擊藍色「使用 Google 登入」按鈕

如果 Google 登入仍有問題，可以先使用演示登入功能。