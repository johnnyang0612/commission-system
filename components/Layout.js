import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSimpleAuth, signOutSimple } from '../utils/simpleAuth';
import { USER_ROLES, hasPermission, PERMISSIONS } from '../utils/permissions';

export default function Layout({ children }) {
  const router = useRouter();
  const { user, loading } = useSimpleAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);

  // 關閉手機選單當路由改變
  useEffect(() => {
    setMobileMenuOpen(false);
    setActiveDropdown(null);
  }, [router.pathname]);

  // 點擊外部關閉下拉選單
  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    if (activeDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeDropdown]);

  const isActive = (path) => router.pathname === path;
  const isActiveGroup = (paths) => paths.some(p => router.pathname === p || router.pathname.startsWith(p + '/'));

  const handleLogout = async () => {
    const confirmed = confirm('確定要登出嗎？');
    if (confirmed) {
      await signOutSimple();
      router.push('/login');
    }
  };

  // 檢查用戶權限
  const canManageUsers = user && hasPermission(user.role, PERMISSIONS.MANAGE_USERS);
  const canViewFinance = user && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.FINANCE);

  // 如果正在載入認證狀態，顯示載入畫面
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f7fafc'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #e2e8f0',
            borderTopColor: '#4299e1',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <div style={{ color: '#718096' }}>載入中...</div>
        </div>
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
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
        minHeight: '100vh',
        backgroundColor: '#f7fafc'
      }}>
        <div style={{ color: '#718096' }}>正在重定向到登入頁面...</div>
      </div>
    );
  }

  // 導航項目定義
  const navGroups = [
    {
      id: 'main',
      items: [
        { href: '/dashboard', label: '儀表板', icon: '📊' },
        { href: '/', label: '專案管理', icon: '📁' },
        { href: '/prospects', label: '洽談管理', icon: '🤝' },
      ]
    },
    {
      id: 'finance',
      label: '財務',
      items: [
        { href: '/commissions', label: '分潤管理', icon: '💰' },
        { href: '/payments', label: '付款記錄', icon: '💳' },
        { href: '/maintenance', label: '維護管理', icon: '🔧' },
        ...(canViewFinance ? [{ href: '/payout-management', label: '撥款管理', icon: '📝' }] : []),
        { href: '/my-payouts', label: '我的勞報單', icon: '📋' },
      ]
    },
    {
      id: 'ai',
      label: 'AI 助理',
      items: [
        { href: '/line-integration', label: 'LINE 整合', icon: '💬' },
        { href: '/meetings', label: '會議紀錄', icon: '📅' },
        { href: '/ai-generator', label: 'AI 生成', icon: '🤖' },
        { href: '/knowledge-base', label: '知識庫', icon: '📚' },
      ]
    },
    {
      id: 'admin',
      items: [
        ...(canManageUsers ? [{ href: '/user-management', label: '用戶管理', icon: '👥' }] : []),
        { href: '/profile', label: '個人資料', icon: '👤' },
      ]
    }
  ];

  const NavLink = ({ href, label, icon, mobile = false }) => (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: mobile ? '12px 16px' : '8px 12px',
        borderRadius: '8px',
        color: isActive(href) ? '#4299e1' : (mobile ? '#1a202c' : 'white'),
        backgroundColor: isActive(href) ? (mobile ? '#ebf8ff' : 'rgba(66, 153, 225, 0.2)') : 'transparent',
        textDecoration: 'none',
        fontSize: mobile ? '15px' : '14px',
        fontWeight: isActive(href) ? '600' : '400',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap'
      }}
      onClick={() => mobile && setMobileMenuOpen(false)}
    >
      <span style={{ fontSize: mobile ? '18px' : '14px' }}>{icon}</span>
      {label}
    </Link>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f7fafc' }}>
      {/* 導航列 */}
      <nav style={{
        backgroundColor: '#1a202c',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 16px',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: '56px'
          }}>
            {/* Logo */}
            <Link href="/dashboard" style={{
              color: 'white',
              fontSize: '18px',
              fontWeight: '700',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '24px' }}>🏢</span>
              <span className="hide-mobile">川輝科技</span>
            </Link>

            {/* 桌面導航 */}
            <div className="desktop-nav" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {navGroups.map(group => (
                <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  {group.items.map(item => (
                    <NavLink key={item.href} {...item} />
                  ))}
                  {group.id !== 'admin' && (
                    <div style={{
                      width: '1px',
                      height: '24px',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      margin: '0 8px'
                    }} />
                  )}
                </div>
              ))}
            </div>

            {/* 用戶資訊 (桌面) */}
            <div className="desktop-nav" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ color: '#a0aec0', fontSize: '13px' }}>
                {user?.name || user?.email}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#e53e3e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'background-color 0.2s'
                }}
              >
                登出
              </button>
            </div>

            {/* 漢堡選單按鈕 (手機) */}
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                display: 'none',
                padding: '8px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'white'
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileMenuOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path d="M3 12h18M3 6h18M3 18h18" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* 手機選單 */}
        <div
          className="mobile-menu"
          style={{
            display: mobileMenuOpen ? 'block' : 'none',
            position: 'absolute',
            top: '56px',
            left: 0,
            right: 0,
            backgroundColor: 'white',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            maxHeight: 'calc(100vh - 56px)',
            overflowY: 'auto'
          }}
        >
          <div style={{ padding: '8px' }}>
            {navGroups.map(group => (
              <div key={group.id} style={{ marginBottom: '8px' }}>
                {group.label && (
                  <div style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#718096',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {group.label}
                  </div>
                )}
                {group.items.map(item => (
                  <NavLink key={item.href} {...item} mobile />
                ))}
              </div>
            ))}

            {/* 用戶資訊 (手機) */}
            <div style={{
              borderTop: '1px solid #e2e8f0',
              marginTop: '8px',
              paddingTop: '16px',
              padding: '16px'
            }}>
              <div style={{
                fontSize: '14px',
                color: '#718096',
                marginBottom: '12px'
              }}>
                {user?.name || user?.email}
              </div>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#e53e3e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                登出
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 主內容區 */}
      <main style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '20px 16px'
      }}>
        {children}
      </main>

      {/* 響應式樣式 */}
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        /* 桌面版 */
        @media (min-width: 1024px) {
          .desktop-nav {
            display: flex !important;
          }
          .mobile-menu-btn {
            display: none !important;
          }
          .mobile-menu {
            display: none !important;
          }
        }

        /* 平板與手機 */
        @media (max-width: 1023px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-menu-btn {
            display: block !important;
          }
          .hide-mobile {
            display: none;
          }
        }

        /* 表格響應式 */
        @media (max-width: 768px) {
          table {
            display: block;
            overflow-x: auto;
            white-space: nowrap;
          }

          .responsive-table {
            font-size: 14px;
          }

          .responsive-table th,
          .responsive-table td {
            padding: 8px 12px !important;
          }
        }

        /* 按鈕懸停效果 */
        button:hover:not(:disabled) {
          opacity: 0.9;
        }

        /* 輸入框焦點樣式 */
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: #4299e1 !important;
          box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
        }

        /* 卡片陰影 */
        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        /* 載入動畫 */
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
