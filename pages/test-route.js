import { useRouter } from 'next/router';

export default function TestRoute() {
  const router = useRouter();
  
  return (
    <div style={{ padding: '2rem' }}>
      <h1>路由測試頁面</h1>
      <p>當前路徑: {router.pathname}</p>
      <p>當前 URL: {router.asPath}</p>
      
      <div style={{ marginTop: '2rem' }}>
        <h2>測試連結：</h2>
        <ul>
          <li><a href="/">首頁 (專案管理)</a></li>
          <li><a href="/users">業務人員</a></li>
          <li><a href="/admin/users">用戶管理</a></li>
          <li><a href="/profile">個人資料</a></li>
          <li><a href="/maintenance">維護管理</a></li>
        </ul>
      </div>
    </div>
  );
}