import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSimpleAuth, signOutSimple } from '../utils/simpleAuth';
import { USER_ROLES, hasPermission, PERMISSIONS } from '../utils/permissions';

export default function Layout({ children }) {
  const router = useRouter();
  const { user, loading } = useSimpleAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setMobileMenuOpen(false);
    setActiveDropdown(null);
  }, [router.pathname]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = (path) => router.pathname === path;

  const handleLogout = async () => {
    if (confirm('確定要登出嗎？')) {
      await signOutSimple();
      router.push('/login');
    }
  };

  const canManageUsers = user && hasPermission(user.role, PERMISSIONS.MANAGE_USERS);
  const canViewFinance = user && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.FINANCE);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f7fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#4299e1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: '#718096' }}>載入中...</div>
        </div>
        <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user && router.pathname !== '/login') {
    if (typeof window !== 'undefined') router.push('/login');
    return null;
  }

  // 簡化的導航結構
  const navItems = [
    { href: '/dashboard', label: '首頁', icon: '🏠' },
    { href: '/', label: '專案', icon: '📁' },
    { href: '/prospects', label: '洽談', icon: '🤝' },
    { href: '/commissions', label: '分潤', icon: '💰' },
  ];

  const moreItems = [
    { href: '/payments', label: '付款記錄', icon: '💳' },
    { href: '/maintenance', label: '維護管理', icon: '🔧' },
    { href: '/my-payouts', label: '我的勞報單', icon: '📋' },
    ...(canViewFinance ? [{ href: '/payout-management', label: '撥款管理', icon: '📝' }] : []),
    { href: '/line-integration', label: 'LINE 整合', icon: '💬' },
    { href: '/meetings', label: '會議紀錄', icon: '📅' },
    { href: '/ai-generator', label: 'AI 生成', icon: '🤖' },
    { href: '/knowledge-base', label: '知識庫', icon: '📚' },
    ...(canManageUsers ? [{ href: '/user-management', label: '用戶管理', icon: '👥' }] : []),
    { href: '/profile', label: '個人資料', icon: '👤' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f7fafc' }}>
      {/* 頂部導航 */}
      <nav style={{
        background: '#1a202c',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        padding: '0 16px',
        height: 56
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
          <Link href="/dashboard" style={{ color: 'white', fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
            川輝科技
          </Link>

          {/* 桌面導航 */}
          <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  color: isActive(item.href) ? '#63b3ed' : 'rgba(255,255,255,0.9)',
                  background: isActive(item.href) ? 'rgba(99,179,237,0.15)' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: isActive(item.href) ? 600 : 400
                }}
              >
                {item.label}
              </Link>
            ))}

            {/* 更多下拉選單 */}
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setActiveDropdown(activeDropdown === 'more' ? null : 'more')}
                style={{
                  padding: '8px 14px',
                  borderRadius: 6,
                  color: 'rgba(255,255,255,0.9)',
                  background: activeDropdown === 'more' ? 'rgba(255,255,255,0.1)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                更多 <span style={{ fontSize: 10 }}>▼</span>
              </button>

              {activeDropdown === 'more' && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 8,
                  background: 'white',
                  borderRadius: 8,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  minWidth: 180,
                  padding: '8px 0',
                  zIndex: 1001
                }}>
                  {moreItems.map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 16px',
                        color: isActive(item.href) ? '#4299e1' : '#2d3748',
                        background: isActive(item.href) ? '#ebf8ff' : 'transparent',
                        textDecoration: 'none',
                        fontSize: 14
                      }}
                    >
                      <span>{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* 登出 */}
            <button
              onClick={handleLogout}
              style={{
                marginLeft: 12,
                padding: '6px 14px',
                background: '#e53e3e',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13
              }}
            >
              登出
            </button>
          </div>

          {/* 手機版漢堡選單 */}
          <button
            className="mobile-only"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              padding: 8,
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              display: 'none'
            }}
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileMenuOpen ? <path d="M6 18L18 6M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {/* 手機版底部導航 */}
      <div className="mobile-only" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'white',
        borderTop: '1px solid #e2e8f0',
        display: 'none',
        zIndex: 1000,
        padding: '8px 0 env(safe-area-inset-bottom)'
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
                padding: '8px 12px',
                color: isActive(item.href) ? '#4299e1' : '#718096',
                textDecoration: 'none',
                fontSize: 11,
                gap: 2
              }}
            >
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => setMobileMenuOpen(true)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '8px 12px',
              color: '#718096',
              background: 'none',
              border: 'none',
              fontSize: 11,
              gap: 2,
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 20 }}>☰</span>
            更多
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
              maxWidth: 300,
              background: 'white',
              height: '100%',
              overflowY: 'auto',
              animation: 'slideIn 0.2s ease'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: 20, borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{user?.name || user?.email}</div>
              <div style={{ fontSize: 13, color: '#718096', marginTop: 4 }}>{user?.email}</div>
            </div>
            <div style={{ padding: '12px 0' }}>
              {[...navItems, ...moreItems].map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 20px',
                    color: isActive(item.href) ? '#4299e1' : '#2d3748',
                    background: isActive(item.href) ? '#ebf8ff' : 'transparent',
                    textDecoration: 'none',
                    fontSize: 15
                  }}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
            <div style={{ padding: 20, borderTop: '1px solid #e2e8f0' }}>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: 14,
                  background: '#e53e3e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                登出
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主內容區 */}
      <main style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '16px',
        paddingBottom: 80 // 為手機底部導航留空間
      }}>
        {children}
      </main>

      {/* 全局樣式 */}
      <style jsx global>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* 桌面版 */
        @media (min-width: 769px) {
          .desktop-only { display: flex !important; }
          .mobile-only { display: none !important; }
        }

        /* 手機版 */
        @media (max-width: 768px) {
          .desktop-only { display: none !important; }
          .mobile-only { display: flex !important; }

          main {
            padding-bottom: 100px !important;
          }
        }

        /* 防止橫向滾動 */
        html, body {
          overflow-x: hidden;
          width: 100%;
        }

        /* 表格響應式 */
        table {
          width: 100%;
          border-collapse: collapse;
        }

        @media (max-width: 768px) {
          .table-responsive {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
        }

        /* 輸入框樣式 */
        input, select, textarea {
          font-size: 16px !important; /* 防止 iOS 縮放 */
        }

        /* 按鈕基本樣式 */
        button {
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}
