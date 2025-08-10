import { useRouter } from 'next/router';

export default function TestLogin() {
  const router = useRouter();

  const handleTestLogin = () => {
    // 直接設置 localStorage 並跳轉
    localStorage.setItem('demo_logged_in', 'true');
    alert('已設置演示登入狀態，點擊確定後跳轉到首頁');
    router.push('/');
  };

  const handleClearLogin = () => {
    localStorage.removeItem('demo_logged_in');
    alert('已清除登入狀態');
  };

  const checkStatus = () => {
    const status = localStorage.getItem('demo_logged_in');
    alert(`當前狀態: ${status === 'true' ? '已登入' : '未登入'}`);
  };

  return (
    <div style={{ 
      padding: '2rem',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      <h1>登入測試頁面</h1>
      
      <div style={{ marginBottom: '2rem' }}>
        <h2>測試功能：</h2>
        
        <button
          onClick={handleTestLogin}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            marginRight: '1rem',
            cursor: 'pointer'
          }}
        >
          設置演示登入
        </button>

        <button
          onClick={checkStatus}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            marginRight: '1rem',
            cursor: 'pointer'
          }}
        >
          檢查狀態
        </button>

        <button
          onClick={handleClearLogin}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer'
          }}
        >
          清除登入
        </button>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>導航連結：</h3>
        <ul>
          <li><a href="/">首頁</a></li>
          <li><a href="/login">登入頁</a></li>
        </ul>
      </div>

      <div style={{ 
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '4px'
      }}>
        <h3>使用說明：</h3>
        <ol>
          <li>點擊「設置演示登入」按鈕</li>
          <li>系統會自動跳轉到首頁</li>
          <li>如果無法進入，請點擊「檢查狀態」確認登入狀態</li>
          <li>如需重新測試，點擊「清除登入」</li>
        </ol>
      </div>
    </div>
  );
}