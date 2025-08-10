import '../styles/globals.css';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import Layout from '../components/Layout';

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  
  // 不需要 Layout 的頁面
  const noLayoutPages = ['/login', '/test-login'];
  const shouldUseLayout = !noLayoutPages.includes(router.pathname);

  useEffect(() => {
    // 檢查是否需要登入
    const checkAuth = () => {
      const demoLoggedIn = localStorage.getItem('demo_logged_in');
      const publicPages = ['/login', '/test-login'];
      
      // 如果不是公開頁面且沒有登入，跳轉到登入頁
      if (!publicPages.includes(router.pathname) && demoLoggedIn !== 'true') {
        router.push('/login');
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