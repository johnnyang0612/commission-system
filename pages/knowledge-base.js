import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

const DOCUMENT_TYPES = {
  proposal: { name: '提案書', color: '#3498db', icon: '📋' },
  contract: { name: '合約', color: '#e74c3c', icon: '📄' },
  specification: { name: '規格書', color: '#2ecc71', icon: '📊' },
  meeting_notes: { name: '會議記錄', color: '#f39c12', icon: '📝' },
  amendment: { name: '修正案', color: '#9b59b6', icon: '📝' },
  quotation: { name: '報價單', color: '#1abc9c', icon: '💰' },
  other: { name: '其他文件', color: '#95a5a6', icon: '📁' }
};

export default function KnowledgeBase() {
  const [documents, setDocuments] = useState([]);
  const [embeddings, setEmbeddings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});
  const [filter, setFilter] = useState('all'); // all, processed, unprocessed

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // 取得所有文件
      const { data: docs, error: docsError } = await supabase
        .from('project_documents')
        .select('*, projects(client_name, project_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (docsError) throw docsError;

      // 取得已處理的 embeddings
      const { data: embs, error: embsError } = await supabase
        .from('document_embeddings')
        .select('document_id');

      if (embsError) throw embsError;

      // 建立已處理文件 ID 集合
      const processedIds = new Set(embs?.map(e => e.document_id) || []);

      // 標記文件是否已處理
      const docsWithStatus = (docs || []).map(doc => ({
        ...doc,
        is_processed: processedIds.has(doc.id)
      }));

      setDocuments(docsWithStatus);
      setEmbeddings(embs || []);

    } catch (error) {
      console.error('載入失敗:', error);
      alert('載入資料失敗: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function processDocument(doc) {
    setProcessing(prev => ({ ...prev, [doc.id]: true }));

    try {
      const response = await fetch('/api/documents/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: doc.id })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '處理失敗');
      }

      alert(`✅ 成功處理「${doc.document_name}」\n共 ${data.chunks_processed} 個區塊`);
      fetchData(); // 重新載入

    } catch (error) {
      alert('❌ 處理失敗: ' + error.message);
    } finally {
      setProcessing(prev => ({ ...prev, [doc.id]: false }));
    }
  }

  async function processAll() {
    const unprocessed = documents.filter(d => !d.is_processed);
    if (unprocessed.length === 0) {
      alert('所有文件都已處理完成！');
      return;
    }

    const confirmed = confirm(`確定要處理 ${unprocessed.length} 個未處理的文件嗎？\n這可能需要一些時間。`);
    if (!confirmed) return;

    for (const doc of unprocessed) {
      await processDocument(doc);
    }

    alert('全部處理完成！');
  }

  async function removeFromKnowledge(docId, docName) {
    const confirmed = confirm(`確定要從知識庫移除「${docName}」嗎？\n原始文件不會被刪除。`);
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('document_embeddings')
        .delete()
        .eq('document_id', docId);

      if (error) throw error;

      alert('已從知識庫移除');
      fetchData();

    } catch (error) {
      alert('移除失敗: ' + error.message);
    }
  }

  const filteredDocs = documents.filter(doc => {
    if (filter === 'processed') return doc.is_processed;
    if (filter === 'unprocessed') return !doc.is_processed;
    return true;
  });

  const stats = {
    total: documents.length,
    processed: documents.filter(d => d.is_processed).length,
    unprocessed: documents.filter(d => !d.is_processed).length
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>載入中...</h2>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 頁面標題 */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, color: '#2c3e50' }}>📚 知識庫管理</h1>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>
          管理 AI 文件生成器的知識庫，將上傳的文件轉換為可搜尋的向量資料
        </p>
      </div>

      {/* 統計卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db' }}>{stats.total}</div>
          <div style={{ color: '#666' }}>總文件數</div>
        </div>
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#27ae60' }}>{stats.processed}</div>
          <div style={{ color: '#666' }}>已加入知識庫</div>
        </div>
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#e74c3c' }}>{stats.unprocessed}</div>
          <div style={{ color: '#666' }}>待處理</div>
        </div>
      </div>

      {/* 操作列 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: filter === 'all' ? '#3498db' : '#ecf0f1',
              color: filter === 'all' ? 'white' : '#2c3e50',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            全部 ({stats.total})
          </button>
          <button
            onClick={() => setFilter('processed')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: filter === 'processed' ? '#27ae60' : '#ecf0f1',
              color: filter === 'processed' ? 'white' : '#2c3e50',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            已處理 ({stats.processed})
          </button>
          <button
            onClick={() => setFilter('unprocessed')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: filter === 'unprocessed' ? '#e74c3c' : '#ecf0f1',
              color: filter === 'unprocessed' ? 'white' : '#2c3e50',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            待處理 ({stats.unprocessed})
          </button>
        </div>

        <button
          onClick={processAll}
          disabled={stats.unprocessed === 0}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: stats.unprocessed === 0 ? '#95a5a6' : '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: stats.unprocessed === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          🚀 處理所有待處理文件
        </button>
      </div>

      {/* 文件列表 */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>狀態</th>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>文件名稱</th>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>類型</th>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>專案/客戶</th>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>上傳日期</th>
              <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocs.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: '#666' }}>
                  {filter === 'unprocessed' ? '沒有待處理的文件 🎉' : '沒有文件'}
                </td>
              </tr>
            ) : (
              filteredDocs.map(doc => (
                <tr key={doc.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '1rem' }}>
                    {doc.is_processed ? (
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#d4edda',
                        color: '#155724',
                        borderRadius: '12px',
                        fontSize: '0.85rem'
                      }}>
                        ✅ 已處理
                      </span>
                    ) : (
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#fff3cd',
                        color: '#856404',
                        borderRadius: '12px',
                        fontSize: '0.85rem'
                      }}>
                        ⏳ 待處理
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 'bold' }}>{doc.document_name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>{doc.file_name}</div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: DOCUMENT_TYPES[doc.document_type]?.color || '#95a5a6',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '0.85rem'
                    }}>
                      {DOCUMENT_TYPES[doc.document_type]?.icon} {DOCUMENT_TYPES[doc.document_type]?.name || doc.document_type}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div>{doc.projects?.project_name || '-'}</div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>{doc.projects?.client_name || '-'}</div>
                  </td>
                  <td style={{ padding: '1rem', color: '#666' }}>
                    {new Date(doc.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {doc.is_processed ? (
                      <button
                        onClick={() => removeFromKnowledge(doc.id, doc.document_name)}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#e74c3c',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        移除
                      </button>
                    ) : (
                      <button
                        onClick={() => processDocument(doc)}
                        disabled={processing[doc.id]}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: processing[doc.id] ? '#95a5a6' : '#3498db',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: processing[doc.id] ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {processing[doc.id] ? '處理中...' : '加入知識庫'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 說明 */}
      <div style={{
        marginTop: '2rem',
        padding: '1.5rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6'
      }}>
        <h4 style={{ margin: '0 0 1rem 0' }}>💡 使用說明</h4>
        <ul style={{ margin: 0, paddingLeft: '1.5rem', lineHeight: '1.8' }}>
          <li><strong>加入知識庫</strong>：將文件內容解析並轉換為向量，讓 AI 可以搜尋和參考</li>
          <li><strong>移除</strong>：從知識庫移除文件（原始文件不會被刪除）</li>
          <li>建議優先處理「提案書」、「規格書」、「報價單」等高品質文件</li>
          <li>文件類型會影響 AI 生成時的參考選擇</li>
        </ul>
      </div>
    </div>
  );
}
