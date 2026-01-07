// Storage 診斷頁面
// 檢查 Supabase Storage 設定是否正確

import { useState, useEffect } from 'react';
import { useSimpleAuth } from '../utils/simpleAuth';

export default function StorageCheck() {
  const { user, loading: authLoading } = useSimpleAuth();
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResults, setBackfillResults] = useState(null);

  const runCheck = async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/storage/check');
      const data = await response.json();
      setResults(data);
    } catch (error) {
      setResults({
        supabaseConnected: false,
        errors: ['無法連線到診斷 API: ' + error.message]
      });
    } finally {
      setChecking(false);
    }
  };

  const runBackfill = async () => {
    if (!confirm('確定要回溯下載所有遺漏的檔案嗎？\n\n這可能需要幾分鐘時間。')) {
      return;
    }

    setBackfilling(true);
    setBackfillResults(null);

    try {
      const response = await fetch('/api/storage/backfill', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ limit: 500 })
      });

      const data = await response.json();
      setBackfillResults(data);

      if (response.ok) {
        alert(`回溯完成！\n成功: ${data.success}\n失敗: ${data.failed}\n過期: ${data.expired}`);
      } else {
        alert('回溯失敗: ' + data.error);
      }
    } catch (error) {
      alert('回溯失敗: ' + error.message);
      setBackfillResults({
        error: error.message
      });
    } finally {
      setBackfilling(false);
    }
  };

  useEffect(() => {
    if (user) {
      runCheck();
    }
  }, [user]);

  if (authLoading) {
    return <div style={styles.container}>載入中...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>📦 Storage 診斷工具</h1>
      <p style={styles.subtitle}>檢查 LINE 檔案儲存功能是否正常運作</p>

      <div style={styles.buttonGroup}>
        <button
          onClick={runCheck}
          disabled={checking}
          style={{
            ...styles.button,
            ...(checking ? styles.buttonDisabled : {})
          }}
        >
          {checking ? '檢查中...' : '🔄 重新檢查'}
        </button>

        <button
          onClick={runBackfill}
          disabled={backfilling || (results && !results.canUpload)}
          style={{
            ...styles.button,
            ...styles.buttonSecondary,
            ...(backfilling || (results && !results.canUpload) ? styles.buttonDisabled : {})
          }}
          title={results && !results.canUpload ? '請先修復 Storage 設定' : ''}
        >
          {backfilling ? '回溯中...' : '📥 回溯下載遺漏檔案'}
        </button>
      </div>

      {results && (
        <div style={styles.results}>
          <h2 style={styles.sectionTitle}>診斷結果</h2>

          <div style={styles.checkList}>
            <CheckItem
              label="Supabase 連線"
              status={results.supabaseConnected}
            />
            <CheckItem
              label="chat-files bucket 存在"
              status={results.bucketExists}
            />
            <CheckItem
              label="Bucket 設為公開"
              status={results.bucketPublic}
            />
            <CheckItem
              label="可以上傳檔案"
              status={results.canUpload}
            />
            <CheckItem
              label="可以讀取檔案"
              status={results.canRead}
            />
          </div>

          {results.errors && results.errors.length > 0 && (
            <div style={styles.errorSection}>
              <h3 style={styles.errorTitle}>❌ 發現問題</h3>
              {results.errors.map((error, index) => (
                <div key={index} style={styles.errorItem}>
                  {error}
                </div>
              ))}
            </div>
          )}

          {results.canUpload && results.canRead && (
            <div style={styles.successSection}>
              <h3 style={styles.successTitle}>✅ Storage 設定正常</h3>
              <p>LINE 檔案儲存功能應該可以正常運作</p>
              <p style={{ marginTop: '10px', fontSize: '14px' }}>
                💡 提示：如果之前有檔案沒下載到，可以點擊上方「回溯下載遺漏檔案」按鈕補下載
              </p>
            </div>
          )}

          {backfillResults && (
            <div style={styles.backfillSection}>
              <h3 style={styles.sectionTitle}>📥 回溯下載結果</h3>
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <div style={styles.statValue}>{backfillResults.total || 0}</div>
                  <div style={styles.statLabel}>找到的訊息</div>
                </div>
                <div style={{...styles.statCard, backgroundColor: '#d4edda'}}>
                  <div style={styles.statValue}>{backfillResults.success || 0}</div>
                  <div style={styles.statLabel}>成功下載</div>
                </div>
                <div style={{...styles.statCard, backgroundColor: '#fff3cd'}}>
                  <div style={styles.statValue}>{backfillResults.expired || 0}</div>
                  <div style={styles.statLabel}>檔案已過期</div>
                </div>
                <div style={{...styles.statCard, backgroundColor: '#f8d7da'}}>
                  <div style={styles.statValue}>{backfillResults.failed || 0}</div>
                  <div style={styles.statLabel}>下載失敗</div>
                </div>
              </div>
              {backfillResults.errors && backfillResults.errors.length > 0 && (
                <details style={styles.errorDetails}>
                  <summary style={styles.errorSummary}>
                    查看錯誤詳情 ({backfillResults.errors.length})
                  </summary>
                  {backfillResults.errors.map((error, index) => (
                    <div key={index} style={styles.errorDetailItem}>
                      {error}
                    </div>
                  ))}
                </details>
              )}
            </div>
          )}

          {!results.bucketExists && (
            <div style={styles.guideSection}>
              <h3 style={styles.guideTitle}>📝 設定步驟</h3>
              <ol style={styles.steps}>
                <li>前往 <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" style={styles.link}>Supabase Dashboard</a></li>
                <li>選擇您的專案</li>
                <li>左側選單點選 <strong>Storage</strong></li>
                <li>點選 <strong>New bucket</strong></li>
                <li>輸入名稱: <code style={styles.code}>chat-files</code></li>
                <li>勾選 <strong>Public bucket</strong></li>
                <li>點選 <strong>Create bucket</strong></li>
                <li>建立後，到 <strong>Policies</strong> 頁籤</li>
                <li>新增政策允許上傳檔案（可以先設為 public 測試）</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckItem({ label, status }) {
  return (
    <div style={styles.checkItem}>
      <span style={status ? styles.checkIconSuccess : styles.checkIconFail}>
        {status ? '✅' : '❌'}
      </span>
      <span style={styles.checkLabel}>{label}</span>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '800px',
    margin: '40px auto',
    padding: '20px'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    marginBottom: '10px'
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '30px'
  },
  buttonGroup: {
    display: 'flex',
    gap: '10px',
    marginBottom: '30px',
    flexWrap: 'wrap'
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    backgroundColor: '#0070f3',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  buttonSecondary: {
    backgroundColor: '#28a745'
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed'
  },
  results: {
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    padding: '20px'
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px'
  },
  checkList: {
    marginBottom: '20px'
  },
  checkItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: 'white',
    borderRadius: '6px',
    marginBottom: '8px'
  },
  checkIconSuccess: {
    fontSize: '20px',
    marginRight: '12px'
  },
  checkIconFail: {
    fontSize: '20px',
    marginRight: '12px'
  },
  checkLabel: {
    fontSize: '16px'
  },
  errorSection: {
    backgroundColor: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '6px',
    padding: '15px',
    marginTop: '20px'
  },
  errorTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '10px',
    color: '#856404'
  },
  errorItem: {
    padding: '8px',
    backgroundColor: 'white',
    borderRadius: '4px',
    marginBottom: '8px',
    fontSize: '14px',
    color: '#856404'
  },
  successSection: {
    backgroundColor: '#d4edda',
    border: '1px solid #28a745',
    borderRadius: '6px',
    padding: '15px',
    marginTop: '20px'
  },
  successTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '5px',
    color: '#155724'
  },
  guideSection: {
    backgroundColor: '#e7f3ff',
    border: '1px solid '#0070f3',
    borderRadius: '6px',
    padding: '15px',
    marginTop: '20px'
  },
  guideTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '10px',
    color: '#004085'
  },
  steps: {
    marginLeft: '20px',
    lineHeight: '1.8'
  },
  link: {
    color: '#0070f3',
    textDecoration: 'none',
    fontWeight: 'bold'
  },
  code: {
    backgroundColor: '#f4f4f4',
    padding: '2px 6px',
    borderRadius: '3px',
    fontFamily: 'monospace'
  },
  backfillSection: {
    backgroundColor: '#f0f8ff',
    border: '1px solid #0070f3',
    borderRadius: '6px',
    padding: '15px',
    marginTop: '20px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '10px',
    marginBottom: '15px'
  },
  statCard: {
    backgroundColor: 'white',
    padding: '15px',
    borderRadius: '6px',
    textAlign: 'center'
  },
  statValue: {
    fontSize: '32px',
    fontWeight: 'bold',
    marginBottom: '5px'
  },
  statLabel: {
    fontSize: '14px',
    color: '#666'
  },
  errorDetails: {
    marginTop: '15px',
    backgroundColor: 'white',
    padding: '10px',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  errorSummary: {
    fontWeight: 'bold',
    fontSize: '14px',
    padding: '5px'
  },
  errorDetailItem: {
    fontSize: '13px',
    padding: '5px',
    borderBottom: '1px solid #eee',
    color: '#666'
  }
};
