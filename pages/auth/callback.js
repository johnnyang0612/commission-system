import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../utils/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // 處理 OAuth 回調
        const { data, error } = await supabase.auth.exchangeCodeForSession(router.query.code);
        
        if (error) {
          console.error('OAuth callback error:', error);
          router.push('/login?error=' + encodeURIComponent(error.message));
        } else {
          console.log('OAuth success:', data);
          // 成功登入，跳轉到首頁
          router.push('/');
        }
      } catch (err) {
        console.error('Callback handling error:', err);
        router.push('/login?error=callback_failed');
      }
    };

    // 檢查是否有 code 參數
    if (router.query.code) {
      handleCallback();
    } else {
      // 如果沒有 code，可能是直接訪問，回到登入頁
      router.push('/login');
    }
  }, [router.query.code]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f8f9fa'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2>正在處理登入...</h2>
        <p>請稍候，系統正在驗證您的身份</p>
        <div style={{
          width: '50px',
          height: '50px',
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '20px auto'
        }}></div>
      </div>
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}