// 投餵知識 — 丟任何內容進來，AI 自動分析、整理、歸檔到 Wiki
import { useState } from 'react';
import { useSimpleAuth } from '../utils/simpleAuth';

const SOURCE_TYPES = [
  { key: 'document', label: '文件', icon: '📄', desc: '提案書、合約、規格書、報價單等' },
  { key: 'conversation', label: '對話記錄', icon: '💬', desc: '客戶對話、LINE 訊息、Email 往來' },
  { key: 'meeting_note', label: '會議紀錄', icon: '📝', desc: '會議記錄、決議事項、討論內容' },
  { key: 'manual', label: '手動知識', icon: '🧠', desc: '公司規則、SOP、經驗法則' },
  { key: 'code', label: '程式碼', icon: '💻', desc: '技術文件、程式碼片段、架構說明' },
];

export default function WikiIngestPage() {
  const { user, loading } = useSimpleAuth();
  const [sourceType, setSourceType] = useState('document');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleIngest() {
    if (!content.trim()) {
      setError('請輸入要消化的內容');
      return;
    }

    setProcessing(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/wiki/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          content: content.trim(),
          title: title.trim() || undefined,
          clientName: clientName.trim() || undefined,
          userId: user?.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '消化失敗');

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  function handleFileRead(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 讀取文字檔案
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setContent(ev.target.result);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
      };
      reader.readAsText(file);
    } else {
      setError('目前支援文字檔案（.txt, .md, .csv, .json）。PDF 等二進位檔案請先複製文字內容貼上。');
    }
  }

  function handleReset() {
    setContent('');
    setTitle('');
    setClientName('');
    setResult(null);
    setError('');
  }

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>載入中...</div>;
  if (!user) return null;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          投餵知識
        </h1>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>
          丟任何內容進來，AI 自動分析、整理、歸檔到 Wiki
        </p>
      </div>

      {/* Source type selector */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#374151' }}>
          內容類型
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {SOURCE_TYPES.map(st => {
            const isActive = sourceType === st.key;
            return (
              <button
                key={st.key}
                onClick={() => setSourceType(st.key)}
                style={{
                  padding: '12px 16px',
                  border: isActive ? '2px solid #2563eb' : '1px solid #d1d5db',
                  borderRadius: '8px',
                  backgroundColor: isActive ? '#eff6ff' : 'white',
                  cursor: 'pointer',
                  textAlign: 'center',
                  minWidth: '120px',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: '1.3rem', marginBottom: '4px' }}>{st.icon}</div>
                <div style={{ fontWeight: isActive ? 600 : 400, color: isActive ? '#2563eb' : '#374151', fontSize: '0.9rem' }}>
                  {st.label}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                  {st.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main form */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        {/* Optional fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 500, color: '#374151', fontSize: '0.9rem' }}>
              標題（選填）
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例：2024 台積電提案書"
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 500, color: '#374151', fontSize: '0.9rem' }}>
              客戶名稱（選填）
            </label>
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="例：台積電"
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* File upload */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 500, color: '#374151', fontSize: '0.9rem' }}>
            上傳檔案（選填，支援 .txt / .md / .csv / .json）
          </label>
          <input
            type="file"
            accept=".txt,.md,.csv,.json,text/*"
            onChange={handleFileRead}
            style={{
              padding: '0.5rem',
              border: '1px dashed #d1d5db',
              borderRadius: '6px',
              width: '100%',
              fontSize: '0.85rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Content textarea */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 500, color: '#374151', fontSize: '0.9rem' }}>
            內容 *
          </label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="貼上文件內容、對話記錄、會議紀錄、或任何你想讓 AI 學習的知識...&#10;&#10;可以是提案書全文、客戶通話摘要、技術筆記、公司規定等等。&#10;AI 會自動分析、分類，並歸檔到對應的 Wiki 文章中。"
            rows={14}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
            {content.length.toLocaleString()} 字
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={handleIngest}
            disabled={processing || !content.trim()}
            style={{
              padding: '12px 28px',
              backgroundColor: processing ? '#93c5fd' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: processing || !content.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {processing ? (
              <>
                <span style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid white',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                AI 正在分析...
              </>
            ) : (
              '開始消化'
            )}
          </button>
          <button
            onClick={handleReset}
            disabled={processing}
            style={{
              padding: '12px 20px',
              backgroundColor: 'white',
              color: '#64748b',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '0.9rem',
              cursor: processing ? 'not-allowed' : 'pointer',
            }}
          >
            清除
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '1rem 1.5rem',
          backgroundColor: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
          marginBottom: '1rem',
        }}>
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          padding: '1.5rem',
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
            消化完成！
          </h3>

          <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: '#4b5563', fontSize: '0.85rem' }}>新建文章</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#166534' }}>{result.articlesCreated}</div>
            </div>
            <div>
              <span style={{ color: '#4b5563', fontSize: '0.85rem' }}>更新文章</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#166534' }}>{result.articlesUpdated}</div>
            </div>
          </div>

          {result.affectedPaths && result.affectedPaths.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 0.5rem 0', color: '#374151', fontSize: '0.9rem' }}>影響的文章：</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {result.affectedPaths.map(path => (
                  <a
                    key={path}
                    href="/wiki"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      backgroundColor: 'white',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      color: '#2563eb',
                      textDecoration: 'none',
                      fontSize: '0.85rem',
                      width: 'fit-content',
                    }}
                  >
                    <span style={{ color: '#94a3b8' }}>wiki/</span>
                    {path}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <a
              href="/wiki"
              style={{
                padding: '8px 20px',
                backgroundColor: '#2563eb',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              前往 Wiki 查看
            </a>
            <button
              onClick={handleReset}
              style={{
                padding: '8px 20px',
                backgroundColor: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              繼續投餵
            </button>
          </div>
        </div>
      )}

      {/* CSS animation for spinner */}
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
