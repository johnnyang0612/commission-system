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
  
  // 如果沒有登入，重定向到登入頁面
  if (!user && router.pathname !== '/login') {
    if (typeof window !== 'undefined') {
      router.push('/login');
    }
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh' 
      }}>
        <div>正在重定向到登入頁面...</div>
      </div>
    );
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
          <div style={{ color: 'white', margin: 0, fontSize: '1.2rem', fontWeight: '600' }}>
            川輝科技
          </div>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <Link href="/dashboard" style={{
              color: isActive('/dashboard') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/dashboard') ? 'bold' : 'normal'
            }}>
              儀表板
            </Link>
            <Link href="/" style={{
              color: isActive('/') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/') ? 'bold' : 'normal'
            }}>
              專案管理
            </Link>
            <Link href="/prospects" style={{
              color: isActive('/prospects') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/prospects') ? 'bold' : 'normal'
            }}>
              洽談管理
            </Link>
            <Link href="/user-management" style={{
              color: isActive('/user-management') ? '#3498db' : 'white',
              textDecoration: 'none',
              fontWeight: isActive('/user-management') ? 'bold' : 'normal'
            }}>
              用戶管理
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

            {/* AI 功能區 */}
            <div style={{ borderLeft: '1px solid #4a5568', paddingLeft: '1.5rem', marginLeft: '0.5rem', display: 'flex', gap: '1.5rem' }}>
              <Link href="/line-integration" style={{
                color: isActive('/line-integration') ? '#06c755' : '#06c755',
                textDecoration: 'none',
                fontWeight: isActive('/line-integration') ? 'bold' : 'normal'
              }}>
                💬 LINE
              </Link>
              <Link href="/meetings" style={{
                color: isActive('/meetings') ? '#3498db' : 'white',
                textDecoration: 'none',
                fontWeight: isActive('/meetings') ? 'bold' : 'normal'
              }}>
                📝 會議紀錄
              </Link>
              <Link href="/ai-generator" style={{
                color: isActive('/ai-generator') ? '#f39c12' : '#f39c12',
                textDecoration: 'none',
                fontWeight: isActive('/ai-generator') ? 'bold' : 'normal'
              }}>
                🤖 AI生成
              </Link>
              <Link href="/knowledge-base" style={{
                color: isActive('/knowledge-base') ? '#3498db' : 'white',
                textDecoration: 'none',
                fontWeight: isActive('/knowledge-base') ? 'bold' : 'normal'
              }}>
                📚 知識庫
              </Link>
            </div>
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