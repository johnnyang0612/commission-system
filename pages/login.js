import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useRouter } from 'next/router';

export default function Login() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    // 檢查是否已登入
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/');
      }
    };
    
    checkUser();

    // 監聽認證狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });
      
      if (error) {
        console.error('Google 登入失敗:', error);
        alert('登入失敗：' + error.message);
        setLoading(false);
      } else {
        console.log('Google OAuth 已啟動', data);
        // OAuth 會重定向到 Google，不需要處理
      }
    } catch (err) {
      console.error('登入錯誤:', err);
      alert('登入發生錯誤，請稍後再試');
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    // 設置 localStorage 標記為已登入
    localStorage.setItem('demo_logged_in', 'true');
    router.push('/');
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
        <h1 style={{ color: '#2c3e50', marginBottom: '1rem' }}>
          川輝科技
        </h1>
        <h2 style={{ color: '#34495e', marginBottom: '0.5rem' }}>
          業務分潤管理系統
        </h2>
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
            opacity: loading ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            marginBottom: '1rem'
          }}
        >
          {loading ? '登入中...' : (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M17.64 9.20454C17.64 8.56636 17.5827 7.95273 17.4764 7.36364H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5614V15.8195H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.20454Z" fill="white"/>
                <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5614C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="white"/>
                <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z" fill="white"/>
                <path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z" fill="white"/>
              </svg>
              使用 Google 登入
            </>
          )}
        </button>
        
        <div style={{ margin: '1rem 0', textAlign: 'center', color: '#6c757d' }}>
          或
        </div>
        
        <button
          onClick={handleDemoLogin}
          style={{
            width: '100%',
            padding: '1rem',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer'
          }}
        >
          演示登入 (開發測試)
        </button>
        
        <p style={{ fontSize: '0.875rem', color: '#6c757d', marginTop: '1rem' }}>
          僅限公司同仁登入使用
        </p>
      </div>
    </div>
  );
}