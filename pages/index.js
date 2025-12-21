import { useEffect } from 'react';
import { useRouter } from 'next/router';

// 首頁重定向到案件管理
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/cases');
  }, []);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '50vh',
      color: '#64748b'
    }}>
      載入中...
    </div>
  );
}
