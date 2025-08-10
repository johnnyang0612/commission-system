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

  useEffect(() => {
    // 檢查是否需要登入
    const checkAuth = async () => {
      const publicPages = ['/login', '/test-login', '/auth/callback'];
      
      // 如果是公開頁面，不需要檢查
      if (publicPages.includes(router.pathname)) {
        return;
      }
      
      // 檢查 Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // 檢查演示模式
        const demoLoggedIn = localStorage.getItem('demo_logged_in');
        if (demoLoggedIn !== 'true') {
          router.push('/login');
        }
      }
    };

    checkAuth();
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