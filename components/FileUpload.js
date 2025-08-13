import { useState } from 'react';
import { uploadFile, softDeleteFile, ALLOWED_FILE_TYPES, STORAGE_BUCKETS, FOLDER_STRUCTURE } from '../utils/fileUpload';

export default function FileUpload({ 
  onFileUploaded, 
  onFileDeleted,
  bucket = STORAGE_BUCKETS.DOCUMENTS,
  folder = '',
  allowedTypes = ALLOWED_FILE_TYPES.all,
  maxFiles = 50,
  currentFiles = [],
  disabled = false,
  label = '選擇檔案',
  projectId = null,
  userId = null
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) return;
    
    // 檢查檔案數量限制
    if (currentFiles.length + files.length > maxFiles) {
      alert(`最多只能上傳 ${maxFiles} 個檔案`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const uploadPromises = files.map(async (file, index) => {
        const result = await uploadFile(file, bucket, folder, allowedTypes);
        
        // 更新進度
        setUploadProgress(((index + 1) / files.length) * 100);
        
        if (result.success) {
          // 通知父元件檔案上傳成功
          if (onFileUploaded) {
            onFileUploaded({
              ...result,
              bucket: bucket,
              folder: folder
            });
          }
        } else {
          throw new Error(result.error);
        }
        
        return result;
      });

      await Promise.all(uploadPromises);
      alert('檔案上傳成功！');
      
    } catch (error) {
      console.error('上傳失敗:', error);
      alert('上傳失敗: ' + error.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      // 清空 input
      event.target.value = '';
    }
  };

  const handleFileDelete = async (fileInfo) => {
    const confirmed = confirm(`確定要刪除檔案「${fileInfo.originalName || fileInfo.fileName}」嗎？\n\n文件將會被移除但保留230天，之後會永久刪除。`);
    if (!confirmed) return;

    try {
      const metadata = {
        fileName: fileInfo.originalName || fileInfo.fileName,
        fileSize: fileInfo.fileSize,
        fileType: fileInfo.fileType,
        deletedBy: userId || 'unknown',
        projectId: projectId,
        reason: '用戶手動刪除'
      };

      const result = await softDeleteFile(fileInfo.bucket || bucket, fileInfo.filePath, metadata);
      
      if (result.success) {
        if (onFileDeleted) {
          onFileDeleted(fileInfo);
        }
        alert(result.message || '檔案已刪除，將在230天後永久清除');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('刪除失敗:', error);
      alert('刪除失敗: ' + error.message);
    }
  };

  const getFileTypeText = (fileType) => {
    if (fileType?.includes('image')) return '圖片';
    if (fileType?.includes('pdf')) return 'PDF';
    if (fileType?.includes('word')) return 'Word';
    if (fileType?.includes('excel') || fileType?.includes('spreadsheet')) return 'Excel';
    return '檔案';
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ marginBottom: '1rem' }}>
      {/* 上傳按鈕 */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ 
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          backgroundColor: disabled ? '#95a5a6' : '#3498db',
          color: 'white',
          borderRadius: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          transition: 'background-color 0.3s'
        }}>
          {uploading ? `上傳中... ${Math.round(uploadProgress)}%` : label}
          <input
            type="file"
            onChange={handleFileSelect}
            multiple={maxFiles > 1}
            accept={allowedTypes.join(',')}
            disabled={disabled || uploading}
            style={{ display: 'none' }}
          />
        </label>
        
        {uploading && (
          <div style={{ 
            width: '100%', 
            backgroundColor: '#ecf0f1', 
            borderRadius: '4px', 
            marginTop: '0.5rem',
            height: '8px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${uploadProgress}%`, 
              backgroundColor: '#3498db', 
              height: '100%',
              transition: 'width 0.3s ease'
            }} />
          </div>
        )}
      </div>

      {/* 調試信息 */}
      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.5rem' }}>
        調試: 目前檔案數量 = {currentFiles.length}
        {currentFiles.length > 0 && `, 檔案: ${currentFiles.map(f => f.fileName || f.originalName).join(', ')}`}
      </div>

      {/* 已上傳檔案列表 */}
      <div>
        <h5 style={{ margin: '0 0 0.5rem 0', color: '#2c3e50' }}>
          已上傳檔案 ({currentFiles.length}):
        </h5>
        {currentFiles.length > 0 ? (
          <div style={{ 
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {currentFiles.map((file, index) => (
              <div key={index} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '0.5rem',
                borderBottom: index < currentFiles.length - 1 ? '1px solid #dee2e6' : 'none'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: '0.9rem', 
                    fontWeight: 'bold',
                    color: '#2c3e50',
                    marginBottom: '0.25rem'
                  }}>
                    {file.customName && file.customName !== file.originalName 
                      ? `${file.customName} (${file.originalName || file.fileName})`
                      : (file.originalName || file.fileName)
                    }
                  </div>
                  <div style={{ 
                    fontSize: '0.8rem', 
                    color: '#666',
                    display: 'flex',
                    gap: '1rem'
                  }}>
                    <span>{getFileTypeText(file.fileType)}</span>
                    {file.fileSize && <span>{formatFileSize(file.fileSize)}</span>}
                    <span>上傳時間: {file.uploadedAt ? new Date(file.uploadedAt).toLocaleString('zh-TW') : '剛才'}</span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {file.publicUrl && (
                    <a
                      href={file.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#27ae60',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '3px',
                        fontSize: '0.8rem'
                      }}
                    >
                      檢視
                    </a>
                  )}
                  
                  <button
                    onClick={() => handleFileDelete(file)}
                    disabled={disabled}
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: disabled ? '#95a5a6' : '#e74c3c',
                      color: 'white',
                      border: '2px solid #000',  // 添加明顯邊框便於調試
                      borderRadius: '3px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem',
                      minWidth: '50px'  // 確保按鈕有最小寬度
                    }}
                    title={`刪除 ${file.originalName || file.fileName} (disabled: ${disabled})`}
                  >
                    刪除 {disabled ? '(禁用)' : ''}
                  </button>
                  
                  {/* 調試信息 */}
                  <div style={{ fontSize: '0.7rem', color: 'red' }}>
                    DEBUG: disabled={disabled?.toString()}, file={file.fileName}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ 
            padding: '1rem',
            textAlign: 'center',
            color: '#666',
            border: '1px dashed #ccc',
            borderRadius: '4px'
          }}>
            尚未上傳任何檔案
          </div>
        )}
      </div>

      {/* 說明文字 */}
      <div style={{ 
        fontSize: '0.8rem', 
        color: '#666', 
        marginTop: '0.5rem',
        lineHeight: '1.4'
      }}>
        • 支援格式：圖片 (JPG, PNG, GIF)、PDF、Word、Excel<br />
        • 檔案大小限制：10MB<br />
        • 最多上傳：{maxFiles} 個檔案
      </div>
    </div>
  );
}