import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSimpleAuth, signOutSimple } from '../utils/simpleAuth';
import { USER_ROLES } from '../utils/permissions';

export default function Layout({ children }) {
  const router = useRouter();
  const { user, loading } = useSimpleAuth();
  
  const isActive = (path) => router.pathname === path;
  
  const handleLogout = async () => {
    const confirmed = confirm('確定要登出嗎？');
    if (confirmed) {
      await signOutSimple();
      router.push('/login');
    }
  };
  
  // 如果正在載入認證狀態，顯示載入畫面
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh' 
      }}>
        <div>載入中...</div>
      </div>
    );
  }
  
  // 如果沒有登入，不顯示 Layout
  if (!user && router.pathname !== '/login') {
    return null;
  }
  
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <nav style={{
        backgroundColor: '#2c3e50',
        padding: '1rem 2rem',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ color: 'white', margin: 0, fontSize: '1.5rem' }}>
            川輝科技｜業務分潤管理系統
          </h1>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <Link href="/" style={{
              color: isActive('/') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/') ? 'bold' : 'normal'
            }}>
              專案管理
            </Link>
            <Link href="/users" style={{
              color: isActive('/users') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/users') ? 'bold' : 'normal'
            }}>
              業務人員
            </Link>
            <Link href="/profile" style={{
              color: isActive('/profile') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/profile') ? 'bold' : 'normal'
            }}>
              個人資料
            </Link>
            <Link href="/commissions" style={{
              color: isActive('/commissions') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/commissions') ? 'bold' : 'normal'
            }}>
              分潤管理
            </Link>
            <Link href="/payments" style={{
              color: isActive('/payments') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/payments') ? 'bold' : 'normal'
            }}>
              付款記錄
            </Link>
            <Link href="/maintenance" style={{
              color: isActive('/maintenance') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/maintenance') ? 'bold' : 'normal'
            }}>
              維護管理
            </Link>
            <Link href="/admin/users" style={{
              color: isActive('/admin/users') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/admin/users') ? 'bold' : 'normal'
            }}>
              用戶管理
            </Link>
          </div>
          
          {/* 用戶資訊和登出按鈕 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: 'white', fontSize: '0.9rem' }}>
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              登出
            </button>
          </div>
        </div>
      </nav>
      <main style={{
        maxWidth: '1200px',
        margin: '2rem auto',
        padding: '0 2rem'
      }}>
        {children}
      </main>
    </div>
  );
}