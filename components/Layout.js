import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children }) {
  const router = useRouter();
  
  const isActive = (path) => router.pathname === path;
  
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