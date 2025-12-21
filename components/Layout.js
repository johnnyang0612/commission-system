import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSimpleAuth, signOutSimple } from '../utils/simpleAuth';
import { USER_ROLES, hasPermission, PERMISSIONS } from '../utils/permissions';

export default function Layout({ children }) {
  const router = useRouter();
  const { user, loading } = useSimpleAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [router.pathname]);

  const isActive = (path) => {
    if (path === '/cases') {
      return router.pathname === '/cases' || router.pathname === '/' || router.pathname === '/prospects' || router.pathname.startsWith('/projects/');
    }
    if (path === '/finance') {
      return router.pathname === '/finance' || router.pathname === '/payments' || router.pathname === '/commissions' || router.pathname === '/my-payouts' || router.pathname === '/labor-receipts';
    }
    if (path === '/ai-generator') {
      return router.pathname === '/ai-generator' || router.pathname === '/knowledge-base';
    }
    return router.pathname === path;
  };

  const handleLogout = async () => {
    if (confirm('確定要登出嗎？')) {
      await signOutSimple();
      router.push('/login');
    }
  };

  const isAdmin = user && user.role === USER_ROLES.ADMIN;
  const isLeader = user && user.role === USER_ROLES.LEADER;
  const isFinance = user && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.FINANCE);
  const canManageUsers = isAdmin || isLeader;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: '#64748b' }}>載入中...</div>
        </div>
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user && router.pathname !== '/login') {
    if (typeof window !== 'undefined') router.push('/login');
    return null;
  }

  // 5 入口導航
  const navItems = [
    { href: '/dashboard', label: '儀表板', icon: '📊' },
    { href: '/cases', label: '案件', icon: '📁' },
    { href: isFinance ? '/finance' : '/my-payouts', label: isFinance ? '財務' : '我的分潤', icon: '💰' },
    { href: '/ai-generator', label: '工具', icon: '🤖' },
    ...(canManageUsers ? [{ href: '/settings', label: '設定', icon: '⚙️' }] : []),
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* 頂部導航 */}
      <nav style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        padding: '0 20px',
        height: 60,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Logo */}
          <Link href="/dashboard" style={{
            color: 'white',
            fontWeight: 700,
            fontSize: 18,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ fontSize: 24 }}>💼</span>
            川輝科技
          </Link>

          {/* 桌面導航 */}
          <div className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  color: isActive(item.href) ? '#fff' : 'rgba(255,255,255,0.8)',
                  background: isActive(item.href) ? 'rgba(255,255,255,0.15)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 15,
                  fontWeight: isActive(item.href) ? 600 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                {item.label}
              </Link>
            ))}

            {/* 用戶資訊 & 登出 */}
            <div style={{
              marginLeft: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingLeft: 16,
              borderLeft: '1px solid rgba(255,255,255,0.2)'
            }}>
              <Link
                href="/profile"
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 14,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 6,
                  transition: 'all 0.2s',
                  background: 'rgba(255,255,255,0.1)'
                }}
                title="個人資料設定"
              >
                <span style={{ fontSize: 16 }}>👤</span>
                {user?.name || user?.email?.split('@')[0]}
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  padding: '8px 14px',
                  background: 'rgba(239,68,68,0.9)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
              >
                登出
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 手機版底部導航 */}
      <div className="mobile-nav" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'white',
        borderTop: '1px solid #e2e8f0',
        zIndex: 1000,
        padding: '6px 0 env(safe-area-inset-bottom)',
        display: 'none'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '8px 16px',
                color: isActive(item.href) ? '#2563eb' : '#64748b',
                textDecoration: 'none',
                fontSize: 11,
                fontWeight: isActive(item.href) ? 600 : 500,
                gap: 4
              }}
            >
              <span style={{ fontSize: 22 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => setMobileMenuOpen(true)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '8px 16px',
              color: '#64748b',
              background: 'none',
              border: 'none',
              fontSize: 11,
              fontWeight: 500,
              gap: 4,
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 22 }}>👤</span>
            個人
          </button>
        </div>
      </div>

      {/* 手機版側邊選單 */}
      {mobileMenuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex'
          }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} />
          <div
            style={{
              width: '80%',
              maxWidth: 320,
              background: 'white',
              height: '100%',
              overflowY: 'auto',
              animation: 'slideIn 0.25s ease'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 用戶資訊 */}
            <div style={{
              padding: 24,
              background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
              color: 'white'
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{user?.name || '用戶'}</div>
              <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>{user?.email}</div>
              <div style={{
                display: 'inline-block',
                marginTop: 12,
                padding: '4px 12px',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: 20,
                fontSize: 12
              }}>
                {user?.role === 'admin' ? '管理員' : user?.role === 'finance' ? '財務' : user?.role === 'leader' ? '主管' : '業務'}
              </div>
            </div>

            {/* 選單項目 */}
            <div style={{ padding: '16px 0' }}>
              <Link
                href="/profile"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 24px',
                  color: '#1e293b',
                  textDecoration: 'none',
                  fontSize: 16
                }}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span style={{ fontSize: 20 }}>⚙️</span>
                個人資料設定
              </Link>

              <div style={{ height: 1, background: '#e2e8f0', margin: '8px 24px' }} />

              <button
                onClick={handleLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 24px',
                  color: '#ef4444',
                  background: 'none',
                  border: 'none',
                  fontSize: 16,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: 20 }}>🚪</span>
                登出系統
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主內容區 */}
      <main style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: 20,
        paddingBottom: 100
      }}>
        {children}
      </main>

      {/* 響應式樣式 */}
      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-nav { display: block !important; }
        }

        @media (min-width: 769px) {
          .desktop-nav { display: flex !important; }
          .mobile-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}
