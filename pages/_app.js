import '../styles/globals.css';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import Layout from '../components/Layout';

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  
  // 不需要 Layout 的頁面
  const noLayoutPages = ['/login', '/test-login', '/auth/callback'];
  const shouldUseLayout = !noLayoutPages.includes(router.pathname);

  // 移除所有認證檢查，讓組件自己處理

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