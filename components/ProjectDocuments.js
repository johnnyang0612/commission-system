import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import FileUpload from './FileUpload';
import DocumentVersions from './DocumentVersions';
import { STORAGE_BUCKETS, FOLDER_STRUCTURE, softDeleteFile } from '../utils/fileUpload';

const DOCUMENT_TYPES = {
  proposal: { name: '提案書', color: '#3498db', icon: '📋' },
  contract: { name: '合約', color: '#e74c3c', icon: '📄' },
  specification: { name: '規格書', color: '#2ecc71', icon: '📊' },
  meeting_notes: { name: '會議記錄', color: '#f39c12', icon: '📝' },
  amendment: { name: '修正案', color: '#9b59b6', icon: '📝' },
  other: { name: '其他文件', color: '#95a5a6', icon: '📁' }
};

const DOCUMENT_STATUS = {
  draft: { name: '草稿', color: '#95a5a6' },
  review: { name: '審核中', color: '#f39c12' },
  approved: { name: '已核准', color: '#2ecc71' },
  signed: { name: '已簽署', color: '#27ae60' },
  archived: { name: '已歸檔', color: '#7f8c8d' }
};

export default function ProjectDocuments({ projectId, userRole }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [viewMode, setViewMode] = useState('all'); // 'all', 'current', 'archived'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created_at'); // 'created_at', 'type', 'name', 'version'
  const [sortOrder, setSortOrder] = useState('desc');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);

  const [documentForm, setDocumentForm] = useState({
    document_type: 'proposal',
    document_name: '',
    description: '',
    tags: '',
    is_important: false,
    is_confidential: false,
    document_status: 'draft',
    version_notes: '',
    uploaded_files: []
  });

  useEffect(() => {
    if (projectId) {
      fetchDocuments();
    }
  }, [projectId, viewMode, sortBy, sortOrder]);

  async function fetchDocuments() {
    setLoading(true);
    try {
      let query = supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', projectId);

      // 根據檢視模式過濾
      if (viewMode === 'current') {
        query = query.eq('is_current_version', true).is('deleted_at', null);
      } else if (viewMode === 'archived') {
        query = query.eq('document_status', 'archived').is('deleted_at', null);
      } else if (viewMode === 'deleted') {
        query = query.not('deleted_at', 'is', null);
      } else {
        // 默認情況下不顯示已軟刪除的文件
        query = query.is('deleted_at', null);
      }

      // 排序
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      const { data, error } = await query;

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('獲取文件失敗:', error);
      alert('載入文件失敗: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddDocument(e) {
    e.preventDefault();
    if (documentForm.uploaded_files.length === 0) {
      alert('請至少上傳一個文件');
      return;
    }

    try {
      // 為每個上傳的文件建立記錄
      for (const file of documentForm.uploaded_files) {
        const documentData = {
          project_id: projectId,
          document_type: documentForm.document_type,
          document_name: documentForm.document_name || file.originalName,
          file_name: file.fileName,
          file_path: file.filePath,
          file_size: file.fileSize,
          file_type: file.fileType,
          public_url: file.publicUrl,
          bucket_name: file.bucket,
          description: documentForm.description,
          tags: documentForm.tags ? documentForm.tags.split(',').map(tag => tag.trim()) : [],
          is_important: documentForm.is_important,
          is_confidential: documentForm.is_confidential,
          document_status: documentForm.document_status,
          version_notes: documentForm.version_notes,
          created_by: 'current_user' // 實際應用中應該是當前用戶
        };

        const { error } = await supabase
          .from('project_documents')
          .insert([documentData]);

        if (error) throw error;
      }

      alert('文件上傳成功！');
      setShowAddForm(false);
      resetForm();
      fetchDocuments();
    } catch (error) {
      console.error('新增文件失敗:', error);
      alert('新增文件失敗: ' + error.message);
    }
  }

  async function createNewVersion(originalDocument) {
    // 實作新版本建立邏輯
    const newVersionData = {
      ...originalDocument,
      id: undefined, // 讓資料庫自動產生新 ID
      version_number: (originalDocument.version_number || 1) + 1,
      parent_document_id: originalDocument.parent_document_id || originalDocument.id,
      is_current_version: true,
      version_notes: prompt('請輸入版本更新說明：') || '',
      created_at: undefined,
      updated_at: undefined
    };

    try {
      // 將舊版本標記為非當前版本
      await supabase
        .from('project_documents')
        .update({ is_current_version: false })
        .eq('id', originalDocument.id);

      // 建立新版本
      const { error } = await supabase
        .from('project_documents')
        .insert([newVersionData]);

      if (error) throw error;

      alert('新版本建立成功！');
      fetchDocuments();
    } catch (error) {
      console.error('建立新版本失敗:', error);
      alert('建立新版本失敗: ' + error.message);
    }
  }

  async function updateDocumentStatus(documentId, newStatus) {
    try {
      const { error } = await supabase
        .from('project_documents')
        .update({ 
          document_status: newStatus,
          approved_date: newStatus === 'approved' ? new Date().toISOString().split('T')[0] : null
        })
        .eq('id', documentId);

      if (error) throw error;

      alert('文件狀態更新成功！');
      fetchDocuments();
    } catch (error) {
      console.error('更新文件狀態失敗:', error);
      alert('更新文件狀態失敗: ' + error.message);
    }
  }

  async function handleDeleteDocument(doc) {
    const confirmed = confirm(`確定要刪除文件「${doc.document_name}」嗎？\n\n文件將會被移除但保留230天，之後會永久刪除。`);
    if (!confirmed) return;

    try {
      // 軟刪除 Storage 中的檔案
      const metadata = {
        fileName: doc.file_name,
        fileSize: doc.file_size,
        fileType: doc.file_type,
        deletedBy: 'current_user', // 實際應用中應該是當前用戶
        projectId: projectId,
        documentId: doc.id,
        reason: '用戶手動刪除'
      };

      const result = await softDeleteFile(doc.bucket_name || STORAGE_BUCKETS.DOCUMENTS, doc.file_path, metadata);
      
      if (result.success) {
        // 標記數據庫中的文件記錄為已刪除
        const { error: dbError } = await supabase
          .from('project_documents')
          .update({ 
            document_status: 'archived',
            deleted_at: new Date().toISOString()
          })
          .eq('id', doc.id);

        if (dbError) {
          console.error('標記文件為已刪除失敗:', dbError);
          alert('刪除失敗: ' + dbError.message);
          return;
        }

        alert(result.message || '檔案已刪除，將在230天後永久清除');
        fetchDocuments(); // 重新載入文件列表
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('刪除失敗:', error);
      alert('刪除失敗: ' + error.message);
    }
  }

  function resetForm() {
    setDocumentForm({
      document_type: 'proposal',
      document_name: '',
      description: '',
      tags: '',
      is_important: false,
      is_confidential: false,
      document_status: 'draft',
      version_notes: '',
      uploaded_files: []
    });
  }

  function openVersionHistory(documentId) {
    setSelectedDocumentId(documentId);
    setShowVersionHistory(true);
  }

  function closeVersionHistory() {
    setShowVersionHistory(false);
    setSelectedDocumentId(null);
    fetchDocuments(); // 重新載入以顯示最新狀態
  }

  const filteredDocuments = documents.filter(doc => 
    !searchTerm || 
    doc.document_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  const groupedDocuments = filteredDocuments.reduce((groups, doc) => {
    const type = doc.document_type;
    if (!groups[type]) groups[type] = [];
    groups[type].push(doc);
    return groups;
  }, {});

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>載入中...</div>;
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      {/* 頁面標題和控制項 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <h3 style={{ margin: 0 }}>📁 專案文件管理</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            {showAddForm ? '取消新增' : '+ 新增文件'}
          </button>
        </div>
      </div>

      {/* 搜尋和篩選控制項 */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '2rem',
        padding: '1rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px'
      }}>
        <input
          type="text"
          placeholder="搜尋文件名稱、描述或標籤..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
        />
        
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          style={{
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
        >
          <option value="all">所有文件</option>
          <option value="current">最新版本</option>
          <option value="archived">已歸檔</option>
          <option value="deleted">已刪除</option>
        </select>

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          style={{
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
        >
          <option value="">所有類型</option>
          {Object.entries(DOCUMENT_TYPES).map(([key, type]) => (
            <option key={key} value={key}>{type.icon} {type.name}</option>
          ))}
        </select>

        <select
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [field, order] = e.target.value.split('-');
            setSortBy(field);
            setSortOrder(order);
          }}
          style={{
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
        >
          <option value="created_at-desc">最新建立</option>
          <option value="created_at-asc">最舊建立</option>
          <option value="document_name-asc">名稱 A-Z</option>
          <option value="document_name-desc">名稱 Z-A</option>
          <option value="document_type-asc">類型</option>
          <option value="version_number-desc">版本</option>
        </select>
      </div>

      {/* 新增文件表單 */}
      {showAddForm && (
        <form onSubmit={handleAddDocument} style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          border: '2px solid #27ae60'
        }}>
          <h4 style={{ marginTop: 0, color: '#27ae60' }}>新增文件</h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                文件類型 *
              </label>
              <select
                value={documentForm.document_type}
                onChange={(e) => setDocumentForm({...documentForm, document_type: e.target.value})}
                required
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                {Object.entries(DOCUMENT_TYPES).map(([key, type]) => (
                  <option key={key} value={key}>{type.icon} {type.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                文件名稱
              </label>
              <input
                type="text"
                value={documentForm.document_name}
                onChange={(e) => setDocumentForm({...documentForm, document_name: e.target.value})}
                placeholder="如不填寫將使用檔案名稱"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              描述
            </label>
            <textarea
              value={documentForm.description}
              onChange={(e) => setDocumentForm({...documentForm, description: e.target.value})}
              placeholder="文件描述或重點說明"
              rows="3"
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                標籤 (用逗號分隔)
              </label>
              <input
                type="text"
                value={documentForm.tags}
                onChange={(e) => setDocumentForm({...documentForm, tags: e.target.value})}
                placeholder="例如：緊急, 客戶A, 第二版"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                文件狀態
              </label>
              <select
                value={documentForm.document_status}
                onChange={(e) => setDocumentForm({...documentForm, document_status: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                {Object.entries(DOCUMENT_STATUS).map(([key, status]) => (
                  <option key={key} value={key}>{status.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', paddingBottom: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={documentForm.is_important}
                  onChange={(e) => setDocumentForm({...documentForm, is_important: e.target.checked})}
                />
                重要文件
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={documentForm.is_confidential}
                  onChange={(e) => setDocumentForm({...documentForm, is_confidential: e.target.checked})}
                />
                機密文件
              </label>
            </div>
          </div>

          <FileUpload
            onFileUploaded={(fileInfo) => {
              setDocumentForm({
                ...documentForm,
                uploaded_files: [...documentForm.uploaded_files, fileInfo]
              });
            }}
            onFileDeleted={(deletedFile) => {
              setDocumentForm({
                ...documentForm,
                uploaded_files: documentForm.uploaded_files.filter(file => file.filePath !== deletedFile.filePath)
              });
            }}
            bucket={STORAGE_BUCKETS.DOCUMENTS}
            folder={`${FOLDER_STRUCTURE.PROJECTS}/${projectId}/documents`}
            currentFiles={documentForm.uploaded_files}
            maxFiles={50}
            label="上傳文件"
            projectId={projectId}
            userId={null}
          />

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
            <button
              type="submit"
              style={{
                padding: '0.75rem 2rem',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              新增文件
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                resetForm();
              }}
              style={{
                padding: '0.75rem 2rem',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}

      {/* 文件列表 */}
      {filteredDocuments.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          color: '#666'
        }}>
          {searchTerm ? '沒有符合搜尋條件的文件' : '尚無文件，點擊「新增文件」開始上傳'}
        </div>
      ) : (
        Object.entries(groupedDocuments)
          .filter(([type]) => !selectedType || type === selectedType)
          .map(([type, docs]) => (
            <div key={type} style={{ marginBottom: '2rem' }}>
              <h4 style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                color: DOCUMENT_TYPES[type]?.color || '#666',
                marginBottom: '1rem'
              }}>
                <span style={{ fontSize: '1.2rem' }}>{DOCUMENT_TYPES[type]?.icon}</span>
                {DOCUMENT_TYPES[type]?.name} ({docs.length})
              </h4>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
                gap: '1rem',
                overflow: 'visible'
              }}>
                {docs.map(doc => (
                  <div key={doc.id} style={{
                    backgroundColor: doc.deleted_at ? '#f8f9fa' : 'white',
                    padding: '1.5rem',
                    borderRadius: '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    border: doc.deleted_at ? '2px solid #e74c3c' : (doc.is_important ? '2px solid #f39c12' : '1px solid #dee2e6'),
                    position: 'relative',
                    opacity: doc.deleted_at ? 0.8 : 1
                  }}>
                    {/* 重要文件標記 */}
                    {doc.is_important && (
                      <div style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        backgroundColor: '#f39c12',
                        color: 'white',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 'bold'
                      }}>
                        ⭐ 重要
                      </div>
                    )}

                    {/* 機密文件標記 */}
                    {doc.is_confidential && (
                      <div style={{
                        position: 'absolute',
                        top: doc.is_important ? '2.5rem' : '0.5rem',
                        right: '0.5rem',
                        backgroundColor: '#e74c3c',
                        color: 'white',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 'bold'
                      }}>
                        🔒 機密
                      </div>
                    )}

                    {/* 已刪除文件標記 */}
                    {doc.deleted_at && (
                      <div style={{
                        position: 'absolute',
                        top: '0.5rem',
                        left: '0.5rem',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 'bold'
                      }}>
                        🗑️ 已刪除
                      </div>
                    )}

                    <div style={{ marginBottom: '1rem' }}>
                      <h5 style={{ 
                        margin: '0 0 0.5rem 0',
                        fontSize: '1.1rem',
                        color: '#2c3e50'
                      }}>
                        {doc.document_name}
                      </h5>
                      
                      {doc.description && (
                        <p style={{ 
                          margin: '0 0 0.5rem 0',
                          fontSize: '0.9rem',
                          color: '#666',
                          lineHeight: '1.4'
                        }}>
                          {doc.description}
                        </p>
                      )}
                    </div>

                    {/* 文件資訊 */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '1fr 1fr', 
                      gap: '0.5rem', 
                      fontSize: '0.8rem',
                      color: '#666',
                      marginBottom: '1rem'
                    }}>
                      <div>版本: v{doc.version_number}</div>
                      <div>
                        <span style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '12px',
                          backgroundColor: DOCUMENT_STATUS[doc.document_status]?.color || '#95a5a6',
                          color: 'white',
                          fontSize: '0.7rem'
                        }}>
                          {DOCUMENT_STATUS[doc.document_status]?.name}
                        </span>
                      </div>
                      <div>{new Date(doc.created_at).toLocaleDateString('zh-TW')}</div>
                      <div>{Math.round(doc.file_size / 1024)} KB</div>
                    </div>

                    {/* 標籤 */}
                    {doc.tags && doc.tags.length > 0 && (
                      <div style={{ marginBottom: '1rem' }}>
                        {doc.tags.map((tag, index) => (
                          <span
                            key={index}
                            style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.5rem',
                              margin: '0.2rem',
                              backgroundColor: '#ecf0f1',
                              color: '#2c3e50',
                              borderRadius: '12px',
                              fontSize: '0.7rem'
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 操作按鈕 */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '0.5rem', 
                      flexWrap: 'wrap' 
                    }}>
                      {doc.deleted_at ? (
                        // 已刪除文件的操作按鈕
                        <>
                          <div style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            textAlign: 'center',
                            flex: 1
                          }}>
                            📖 檔案已刪除
                          </div>
                          
                          <div style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#dc3545',
                            color: 'white',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            textAlign: 'center',
                            flex: 1
                          }}>
                            📅 將於 {new Date(new Date(doc.deleted_at).getTime() + 230*24*60*60*1000).toLocaleDateString('zh-TW')} 永久刪除
                          </div>
                        </>
                      ) : (
                        // 正常文件的操作按鈕
                        <>
                          <a
                            href={doc.public_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#3498db',
                              color: 'white',
                              textDecoration: 'none',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              textAlign: 'center',
                              flex: 1
                            }}
                          >
                            📖 開啟
                          </a>
                          
                          <button
                            onClick={() => createNewVersion(doc)}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#f39c12',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              flex: 1
                            }}
                          >
                            📝 新版本
                          </button>

                          <button
                            onClick={() => openVersionHistory(doc.id)}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#9b59b6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              flex: 1
                            }}
                          >
                            📚 版本
                          </button>

                          <button
                            onClick={() => handleDeleteDocument(doc)}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              flex: 1
                            }}
                            title={`刪除文件 ${doc.document_name}`}
                          >
                            🗑️ 刪除
                          </button>

                          <select
                            value={doc.document_status}
                            onChange={(e) => updateDocumentStatus(doc.id, e.target.value)}
                            style={{
                              padding: '0.3rem',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              flex: 1,
                              position: 'relative',
                              zIndex: 10,
                              minWidth: '80px'
                            }}
                          >
                            {Object.entries(DOCUMENT_STATUS).map(([key, status]) => (
                              <option key={key} value={key}>{status.name}</option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
      )}

      {/* 版本歷史模態視窗 */}
      {showVersionHistory && selectedDocumentId && (
        <DocumentVersions
          documentId={selectedDocumentId}
          onClose={closeVersionHistory}
          onSelectVersion={() => {
            closeVersionHistory();
          }}
        />
      )}
    </div>
  );
}