# Google OAuth 登入設置指南

## 步驟 1: 設置 Supabase Authentication

### 1.1 在 Supabase Dashboard 設置
1. 登入您的 **Supabase Dashboard**
2. 選擇您的專案
3. 點選左側選單的 **Authentication**
4. 進入 **Providers** 分頁
5. 找到 **Google** 並點選啟用

### 1.2 Google Cloud Console 設置
1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案或選擇現有專案
3. 啟用 **Google+ API**：
   - 搜尋 "Google+ API"
   - 點選啟用
4. 建立 OAuth 2.0 憑證：
   - 前往 **APIs & Services > Credentials**
   - 點選 **Create Credentials > OAuth client ID**
   - 選擇 **Web application**
   - 名稱：川輝科技分潤系統
   - 授權重新導向 URI：`https://your-supabase-project.supabase.co/auth/v1/callback`

### 1.3 在 Supabase 中設置 Google 憑證
1. 回到 Supabase Dashboard > Authentication > Providers
2. 在 Google 設置中輸入：
   - **Client ID**：從 Google Console 獲得的 Client ID
   - **Client Secret**：從 Google Console 獲得的 Client Secret
3. 點選 **Save**

## 步驟 2: 更新應用程式程式碼

### 2.1 安裝 Supabase Auth UI (可選)
```bash
npm install @supabase/auth-ui-react @supabase/auth-ui-shared
```

### 2.2 建立登入頁面
建立 `pages/login.js`:

```javascript
import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';

export default function Login() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 檢查是否已登入
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`
      }
    });
    
    if (error) {
      console.error('登入失敗:', error);
      alert('登入失敗，請再試一次');
    }
    setLoading(false);
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      backgroundColor: '#f8f9fa'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '3rem',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        textAlign: 'center',
        minWidth: '400px'
      }}>
        <h1>川輝科技 - 業務分潤管理系統</h1>
        <p style={{ color: '#6c757d', marginBottom: '2rem' }}>
          請使用公司 Google 帳號登入
        </p>
        
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '1rem',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? '登入中...' : '使用 Google 登入'}
        </button>
      </div>
    </div>
  );
}
```

### 2.3 建立登出功能
在 Layout.js 中加入登出按鈕:

```javascript
const handleLogout = async () => {
  const { error } = await supabase.auth.signOut();
  if (!error) {
    router.push('/login');
  }
};
```

### 2.4 建立認證保護
建立 `utils/auth.js`:

```javascript
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useRouter } from 'next/router';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // 獲取當前用戶
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
      
      if (!user && router.pathname !== '/login') {
        router.push('/login');
      }
    };

    getUser();

    // 監聽認證狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return { user, loading };
}
```

## 步驟 3: 資料庫用戶同步

### 3.1 建立用戶同步觸發器
在 Supabase SQL Editor 中執行：

```sql
-- 建立用戶同步函數
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, created_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    'sales', -- 預設角色
    now()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 建立觸發器
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();
```

## 步驟 4: 測試設置

1. 確保 Google Cloud Console 中的授權 URI 正確
2. 測試登入流程
3. 檢查用戶是否正確同步到 users 表
4. 驗證角色權限是否正常運作

## 注意事項

- 確保公司同仁使用公司 Google 帳號
- 可以在 Google Workspace 中限制只允許組織內帳號登入
- 第一次登入會自動建立用戶記錄，預設角色為 'sales'
- 管理員可以在用戶管理中調整角色權限

## 安全設置

在 Supabase 中設置 Row Level Security (RLS) 政策以確保資料安全。