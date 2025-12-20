import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

const DOCUMENT_TYPES = [
  { value: 'proposal', label: '提案書', icon: '📋', description: '完整的商業提案，包含方案說明、時程、報價' },
  { value: 'specification', label: '規格書', icon: '📊', description: '技術規格與功能需求文件' },
  { value: 'quotation', label: '報價單', icon: '💰', description: '詳細的價格與項目報價' }
];

export default function AIGenerator() {
  const [formData, setFormData] = useState({
    document_type: 'proposal',
    client_name: '',
    project_name: '',
    requirements: '',
    budget_range: '',
    additional_context: ''
  });

  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [references, setReferences] = useState([]);
  const [error, setError] = useState('');

  // 知識庫統計
  const [stats, setStats] = useState({ total: 0, by_type: {} });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const { data, error } = await supabase
        .from('document_embeddings')
        .select('document_type');

      if (!error && data) {
        const byType = data.reduce((acc, doc) => {
          acc[doc.document_type] = (acc[doc.document_type] || 0) + 1;
          return acc;
        }, {});

        setStats({ total: data.length, by_type: byType });
      }
    } catch (err) {
      console.error('獲取統計失敗:', err);
    } finally {
      setLoadingStats(false);
    }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setGenerating(true);
    setError('');
    setGeneratedContent('');
    setReferences([]);

    try {
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '生成失敗');
      }

      setGeneratedContent(data.generated_content);
      setReferences(data.reference_documents || []);

    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(generatedContent);
    alert('已複製到剪貼簿！');
  }

  function downloadAsText() {
    const blob = new Blob([generatedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formData.project_name || '文件'}_${DOCUMENT_TYPES.find(t => t.value === formData.document_type)?.label || '文件'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 頁面標題 */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🤖 AI 文件生成器
        </h1>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>
          根據客戶需求和歷史文件，自動生成專業的提案書、規格書和報價單
        </p>
      </div>

      {/* 知識庫狀態 */}
      <div style={{
        backgroundColor: '#e8f4fd',
        padding: '1rem 1.5rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        border: '1px solid #b8daff'
      }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: '#004085' }}>📚 知識庫狀態</h4>
        {loadingStats ? (
          <p style={{ margin: 0, color: '#666' }}>載入中...</p>
        ) : stats.total === 0 ? (
          <p style={{ margin: 0, color: '#856404' }}>
            ⚠️ 知識庫目前是空的。請先到「專案詳情」頁面上傳文件，然後到「知識庫管理」處理文件。
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <span>總計: <strong>{stats.total}</strong> 個文件區塊</span>
            {Object.entries(stats.by_type).map(([type, count]) => (
              <span key={type}>
                {DOCUMENT_TYPES.find(t => t.value === type)?.label || type}: <strong>{count}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* 左側：輸入表單 */}
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 1.5rem 0', color: '#2c3e50' }}>輸入需求資訊</h3>

          <form onSubmit={handleGenerate}>
            {/* 文件類型選擇 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                文件類型 *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {DOCUMENT_TYPES.map(type => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, document_type: type.value })}
                    style={{
                      padding: '1rem',
                      border: formData.document_type === type.value ? '2px solid #3498db' : '1px solid #ddd',
                      borderRadius: '8px',
                      backgroundColor: formData.document_type === type.value ? '#ebf5ff' : 'white',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{type.icon}</div>
                    <div style={{ fontWeight: 'bold' }}>{type.label}</div>
                    <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                      {type.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 客戶資訊 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  客戶名稱
                </label>
                <input
                  type="text"
                  value={formData.client_name}
                  onChange={e => setFormData({ ...formData, client_name: e.target.value })}
                  placeholder="例：台灣科技公司"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  專案名稱
                </label>
                <input
                  type="text"
                  value={formData.project_name}
                  onChange={e => setFormData({ ...formData, project_name: e.target.value })}
                  placeholder="例：企業官網改版專案"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
            </div>

            {/* 需求描述 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                需求描述 *
              </label>
              <textarea
                value={formData.requirements}
                onChange={e => setFormData({ ...formData, requirements: e.target.value })}
                placeholder="請詳細描述客戶的需求，例如：&#10;- 需要建立一個電商網站&#10;- 包含會員系統、購物車、金流串接&#10;- 支援手機版響應式設計&#10;- 預計上線時間為 3 個月後"
                rows={6}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* 預算範圍 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                預算範圍
              </label>
              <input
                type="text"
                value={formData.budget_range}
                onChange={e => setFormData({ ...formData, budget_range: e.target.value })}
                placeholder="例：50-80萬"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            {/* 補充資訊 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                補充資訊
              </label>
              <textarea
                value={formData.additional_context}
                onChange={e => setFormData({ ...formData, additional_context: e.target.value })}
                placeholder="任何其他需要考慮的資訊，例如技術限制、競爭對手、特殊需求等"
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* 生成按鈕 */}
            <button
              type="submit"
              disabled={generating || !formData.requirements}
              style={{
                width: '100%',
                padding: '1rem',
                backgroundColor: generating ? '#95a5a6' : '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: generating ? 'not-allowed' : 'pointer'
              }}
            >
              {generating ? '🔄 AI 正在生成中...' : '✨ 生成文件'}
            </button>
          </form>

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px'
            }}>
              ❌ {error}
            </div>
          )}
        </div>

        {/* 右側：生成結果 */}
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, color: '#2c3e50' }}>生成結果</h3>
            {generatedContent && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={copyToClipboard}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  📋 複製
                </button>
                <button
                  onClick={downloadAsText}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#9b59b6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  💾 下載
                </button>
              </div>
            )}
          </div>

          {/* 參考文件 */}
          {references.length > 0 && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px'
            }}>
              <strong>📚 參考了 {references.length} 份歷史文件：</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                {references.map((ref, i) => (
                  <span key={i} style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: '#e9ecef',
                    borderRadius: '4px',
                    fontSize: '0.85rem'
                  }}>
                    {ref.document_name} ({ref.similarity})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 生成的內容 */}
          {generatedContent ? (
            <div style={{
              backgroundColor: '#f8f9fa',
              padding: '1.5rem',
              borderRadius: '8px',
              maxHeight: '600px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              lineHeight: '1.8'
            }}>
              {generatedContent}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              color: '#666',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
              <p>在左側填寫需求資訊後</p>
              <p>點擊「生成文件」按鈕</p>
              <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#999' }}>
                AI 將根據您的需求和歷史文件自動生成專業文件
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
