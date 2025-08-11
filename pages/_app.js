import '../styles/globals.css';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../utils/supabaseClient';

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  
  // 不需要 Layout 的頁面
  const noLayoutPages = ['/login', '/test-login', '/auth/callback'];
  const shouldUseLayout = !noLayoutPages.includes(router.pathname);
  
  // 輸出路徑以便除錯
  console.log('Current path:', router.pathname);

  useEffect(() => {
    // 簡化認證檢查
    const checkAuth = async () => {
      const publicPages = ['/login', '/test-login', '/auth/callback'];
      
      // 公開頁面不需要檢查
      if (publicPages.includes(router.pathname)) {
        return;
      }
      
      try {
        // 檢查 Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          // 檢查演示模式
          const demoLoggedIn = localStorage.getItem('demo_logged_in');
          if (demoLoggedIn !== 'true') {
            router.push('/login');
          }
        }
      } catch (error) {
        console.error('Auth check error:', error);
        // 發生錯誤時不阻擋用戶
      }
    };

    // 延遲檢查以避免競爭狀態
    const timer = setTimeout(checkAuth, 100);
    return () => clearTimeout(timer);
  }, [router.pathname]);

  if (shouldUseLayout) {
    return (
      <Layout>
        <Component {...pageProps} />
      </Layout>
    );
  }

  return <Component {...pageProps} />;
}

export default MyApp;