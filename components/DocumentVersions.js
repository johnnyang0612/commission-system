import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

export default function DocumentVersions({ documentId, onClose, onSelectVersion }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDocument, setCurrentDocument] = useState(null);

  useEffect(() => {
    if (documentId) {
      fetchVersions();
    }
  }, [documentId]);

  async function fetchVersions() {
    setLoading(true);
    try {
      // 首先獲取當前文件資訊
      const { data: currentDoc, error: currentError } = await supabase
        .from('project_documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (currentError) throw currentError;
      setCurrentDocument(currentDoc);

      // 獲取所有版本 (包括當前文件和其歷史版本)
      const parentId = currentDoc.parent_document_id || currentDoc.id;
      
      const { data, error } = await supabase
        .from('project_documents')
        .select('*')
        .or(`id.eq.${parentId},parent_document_id.eq.${parentId}`)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (error) {
      console.error('獲取版本歷史失敗:', error);
      alert('載入版本歷史失敗: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function restoreVersion(versionId) {
    const confirmed = confirm('確定要恢復到此版本嗎？這會建立一個新版本。');
    if (!confirmed) return;

    try {
      const versionToRestore = versions.find(v => v.id === versionId);
      if (!versionToRestore) return;

      // 建立新版本 (基於要恢復的版本)
      const newVersionData = {
        ...versionToRestore,
        id: undefined,
        version_number: Math.max(...versions.map(v => v.version_number)) + 1,
        parent_document_id: currentDocument.parent_document_id || currentDocument.id,
        is_current_version: true,
        version_notes: `恢復到 v${versionToRestore.version_number}`,
        created_at: undefined,
        updated_at: undefined
      };

      // 將當前版本標記為非當前版本
      await supabase
        .from('project_documents')
        .update({ is_current_version: false })
        .eq('is_current_version', true)
        .eq('parent_document_id', currentDocument.parent_document_id || currentDocument.id);

      await supabase
        .from('project_documents')
        .update({ is_current_version: false })
        .eq('id', currentDocument.parent_document_id || currentDocument.id);

      // 建立新版本
      const { error } = await supabase
        .from('project_documents')
        .insert([newVersionData]);

      if (error) throw error;

      alert('版本恢復成功！已建立新版本。');
      onClose();
      if (onSelectVersion) onSelectVersion();
    } catch (error) {
      console.error('恢復版本失敗:', error);
      alert('恢復版本失敗: ' + error.message);
    }
  }

  function getFileTypeIcon(fileType) {
    if (fileType?.includes('pdf')) return '📄';
    if (fileType?.includes('word')) return '📝';
    if (fileType?.includes('excel')) return '📊';
    if (fileType?.includes('image')) return '🖼️';
    return '📁';
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  if (loading) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        backgroundColor: 'rgba(0,0,0,0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{ 
          backgroundColor: 'white', 
          padding: '2rem', 
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          載入中...
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      position: 'fixed', 
      top: 0, 
      left: 0, 
      right: 0, 
      bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.5)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '8px',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '80vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* 標題列 */}
        <div style={{ 
          padding: '1.5rem',
          borderBottom: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0 }}>
            📚 版本歷史：{currentDocument?.document_name}
          </h3>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ✕ 關閉
          </button>
        </div>

        {/* 版本列表 */}
        <div style={{ 
          flex: 1,
          overflow: 'auto',
          padding: '1rem'
        }}>
          {versions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              暫無版本歷史
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {versions.map((version, index) => (
                <div 
                  key={version.id} 
                  style={{
                    border: version.is_current_version ? '2px solid #27ae60' : '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    backgroundColor: version.is_current_version ? '#f8fff8' : 'white',
                    position: 'relative'
                  }}
                >
                  {/* 當前版本標記 */}
                  {version.is_current_version && (
                    <div style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      backgroundColor: '#27ae60',
                      color: 'white',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold'
                    }}>
                      ⭐ 當前版本
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    {/* 版本資訊 */}
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        marginBottom: '0.5rem'
                      }}>
                        <span style={{ fontSize: '1.5rem' }}>
                          {getFileTypeIcon(version.file_type)}
                        </span>
                        <div>
                          <h4 style={{ margin: 0, color: '#2c3e50' }}>
                            v{version.version_number} - {version.document_name}
                          </h4>
                          <div style={{ 
                            fontSize: '0.85rem', 
                            color: '#666',
                            display: 'flex',
                            gap: '1rem',
                            marginTop: '0.25rem'
                          }}>
                            <span>📅 {new Date(version.created_at).toLocaleString('zh-TW')}</span>
                            <span>💾 {formatFileSize(version.file_size)}</span>
                            {version.created_by && <span>👤 {version.created_by}</span>}
                          </div>
                        </div>
                      </div>

                      {/* 版本說明 */}
                      {version.version_notes && (
                        <div style={{ 
                          marginBottom: '0.5rem',
                          padding: '0.75rem',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '4px',
                          fontSize: '0.9rem',
                          color: '#555'
                        }}>
                          <strong>更新說明：</strong> {version.version_notes}
                        </div>
                      )}

                      {/* 文件描述 */}
                      {version.description && (
                        <div style={{ 
                          fontSize: '0.9rem',
                          color: '#666',
                          lineHeight: '1.4',
                          marginBottom: '0.5rem'
                        }}>
                          {version.description}
                        </div>
                      )}

                      {/* 標籤 */}
                      {version.tags && version.tags.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          {version.tags.map((tag, tagIndex) => (
                            <span
                              key={tagIndex}
                              style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                margin: '0.2rem',
                                backgroundColor: '#e3f2fd',
                                color: '#1976d2',
                                borderRadius: '12px',
                                fontSize: '0.75rem'
                              }}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 操作按鈕 */}
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.5rem',
                      minWidth: '120px'
                    }}>
                      <a
                        href={version.public_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#3498db',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          textAlign: 'center'
                        }}
                      >
                        📖 開啟
                      </a>

                      <a
                        href={version.public_url}
                        download={version.file_name}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#27ae60',
                          color: 'white',
                          textDecoration: 'none',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          textAlign: 'center'
                        }}
                      >
                        ⬇️ 下載
                      </a>

                      {!version.is_current_version && (
                        <button
                          onClick={() => restoreVersion(version.id)}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#f39c12',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          🔄 恢復
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 版本之間的連接線 */}
                  {index < versions.length - 1 && (
                    <div style={{
                      position: 'absolute',
                      bottom: '-1rem',
                      left: '2rem',
                      width: '2px',
                      height: '1rem',
                      backgroundColor: '#dee2e6'
                    }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 說明 */}
        <div style={{ 
          padding: '1rem 1.5rem',
          backgroundColor: '#f8f9fa',
          borderTop: '1px solid #dee2e6',
          fontSize: '0.85rem',
          color: '#666'
        }}>
          💡 <strong>提示：</strong>點擊「恢復」可將舊版本恢復為新的當前版本，原文件會保留在歷史中。
        </div>
      </div>
    </div>
  );
}