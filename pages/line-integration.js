import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';

export default function LineIntegration() {
  const { user, loading: authLoading } = useSimpleAuth();
  const [activeTab, setActiveTab] = useState('groups'); // groups, messages, files
  const [lineGroups, setLineGroups] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showBindModal, setShowBindModal] = useState(false);
  const [bindingGroup, setBindingGroup] = useState(null);

  useEffect(() => {
    if (!authLoading && user) {
      fetchLineGroups();
      fetchProspects();
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (selectedGroup) {
      fetchMessages(selectedGroup.group_id);
      fetchFiles(selectedGroup.group_id);
    }
  }, [selectedGroup]);

  async function fetchLineGroups() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('line_groups')
        .select(`
          *,
          prospects:prospect_id(id, client_name, project_name, stage),
          projects:project_id(id, client_name, project_name)
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      setLineGroups(data || []);
    } catch (error) {
      console.error('取得 LINE 群組錯誤:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProspects() {
    try {
      const { data, error } = await supabase
        .from('prospects')
        .select('id, client_name, project_name, stage')
        .in('stage', ['初談', '提案', '報價', '談判', '待簽約'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setProspects(data || []);
    } catch (error) {
      console.error('取得洽談案錯誤:', error);
    }
  }

  async function fetchMessages(groupId) {
    try {
      const { data, error } = await supabase
        .from('line_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('取得訊息錯誤:', error);
    }
  }

  async function fetchFiles(groupId) {
    try {
      const { data, error } = await supabase
        .from('line_files')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error('取得檔案錯誤:', error);
    }
  }

  async function bindGroupToProspect(groupId, prospectId) {
    try {
      const { error } = await supabase
        .from('line_groups')
        .update({ prospect_id: prospectId })
        .eq('group_id', groupId);

      if (error) throw error;

      alert('綁定成功！');
      setShowBindModal(false);
      setBindingGroup(null);
      fetchLineGroups();
    } catch (error) {
      console.error('綁定失敗:', error);
      alert('綁定失敗: ' + error.message);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatFileSize(bytes) {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getMessageIcon(type) {
    switch (type) {
      case 'text': return '💬';
      case 'image': return '🖼️';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'file': return '📄';
      case 'sticker': return '😀';
      case 'location': return '📍';
      default: return '📨';
    }
  }

  function getSenderTypeColor(type) {
    switch (type) {
      case 'staff': return '#3b82f6';
      case 'customer': return '#10b981';
      default: return '#6b7280';
    }
  }

  if (authLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>;
  }

  return (
    <div style={{ padding: '0' }}>
      {/* 頁面標題 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#06c755' }}>●</span> LINE 整合
        </h1>
        <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.9rem' }}>
          管理 LINE 群組綁定，查看對話紀錄和檔案
        </p>
      </div>

      {/* 設定提示 */}
      <div style={{
        backgroundColor: '#fef3c7',
        border: '1px solid #f59e0b',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>⚙️ LINE OA 設定步驟</div>
        <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
          <li>到 <a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">LINE Developers</a> 建立 Messaging API Channel</li>
          <li>取得 Channel Secret 和 Channel Access Token</li>
          <li>設定 Webhook URL: <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/messaging/webhook
          </code></li>
          <li>在 .env.local 設定環境變數</li>
          <li>把 LINE OA 加入客戶群組</li>
        </ol>
      </div>

      {/* 統計卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '1.25rem',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>已加入群組</div>
          <div style={{ fontSize: '2rem', fontWeight: '600', color: '#06c755' }}>
            {lineGroups.filter(g => g.is_active).length}
          </div>
        </div>
        <div style={{
          backgroundColor: 'white',
          padding: '1.25rem',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>已綁定洽談案</div>
          <div style={{ fontSize: '2rem', fontWeight: '600', color: '#3b82f6' }}>
            {lineGroups.filter(g => g.prospect_id).length}
          </div>
        </div>
        <div style={{
          backgroundColor: 'white',
          padding: '1.25rem',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>總訊息數</div>
          <div style={{ fontSize: '2rem', fontWeight: '600', color: '#8b5cf6' }}>
            {lineGroups.reduce((sum, g) => sum + (g.message_count || 0), 0)}
          </div>
        </div>
        <div style={{
          backgroundColor: 'white',
          padding: '1.25rem',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>總檔案數</div>
          <div style={{ fontSize: '2rem', fontWeight: '600', color: '#f59e0b' }}>
            {lineGroups.reduce((sum, g) => sum + (g.file_count || 0), 0)}
          </div>
        </div>
      </div>

      {/* 主內容區 */}
      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '1.5rem' }}>
        {/* 左側: 群組列表 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid #e5e7eb',
            fontWeight: '600'
          }}>
            LINE 群組 ({lineGroups.length})
          </div>

          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>載入中...</div>
            ) : lineGroups.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                <p>還沒有 LINE 群組</p>
                <p style={{ fontSize: '0.85rem' }}>把 LINE OA 加入群組後會自動出現</p>
              </div>
            ) : (
              lineGroups.map(group => (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroup(group)}
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid #f3f4f6',
                    cursor: 'pointer',
                    backgroundColor: selectedGroup?.id === group.id ? '#f0f9ff' : 'transparent',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                        {group.group_name || '未命名群組'}
                        {!group.is_active && (
                          <span style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.75rem',
                            color: '#ef4444'
                          }}>
                            (已離開)
                          </span>
                        )}
                      </div>
                      {group.prospects ? (
                        <div style={{ fontSize: '0.85rem', color: '#3b82f6' }}>
                          🎯 {group.prospects.client_name}
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setBindingGroup(group);
                            setShowBindModal(true);
                          }}
                          style={{
                            fontSize: '0.8rem',
                            color: '#f59e0b',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          + 綁定洽談案
                        </button>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#666' }}>
                      <div>{group.message_count || 0} 訊息</div>
                      <div>{formatDate(group.last_message_at)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右側: 詳情 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          {!selectedGroup ? (
            <div style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666'
            }}>
              選擇左側群組查看詳情
            </div>
          ) : (
            <>
              {/* 群組標題 */}
              <div style={{
                padding: '1rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <h3 style={{ margin: 0 }}>{selectedGroup.group_name}</h3>
                  {selectedGroup.prospects && (
                    <div style={{ fontSize: '0.9rem', color: '#3b82f6' }}>
                      綁定: {selectedGroup.prospects.client_name} / {selectedGroup.prospects.project_name}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setActiveTab('messages')}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: activeTab === 'messages' ? '#3b82f6' : '#f3f4f6',
                      color: activeTab === 'messages' ? 'white' : '#374151',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    💬 訊息
                  </button>
                  <button
                    onClick={() => setActiveTab('files')}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: activeTab === 'files' ? '#3b82f6' : '#f3f4f6',
                      color: activeTab === 'files' ? 'white' : '#374151',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    📁 檔案 ({files.length})
                  </button>
                </div>
              </div>

              {/* 內容區 */}
              <div style={{ height: '500px', overflowY: 'auto', padding: '1rem' }}>
                {activeTab === 'messages' ? (
                  messages.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                      還沒有訊息紀錄
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {messages.map(msg => (
                        <div key={msg.id} style={{
                          display: 'flex',
                          gap: '0.75rem',
                          padding: '0.75rem',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px'
                        }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: getSenderTypeColor(msg.sender_type),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '0.9rem',
                            flexShrink: 0
                          }}>
                            {msg.sender_name?.charAt(0) || '?'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>
                                {msg.sender_name}
                                <span style={{
                                  marginLeft: '0.5rem',
                                  fontSize: '0.75rem',
                                  color: getSenderTypeColor(msg.sender_type)
                                }}>
                                  {msg.sender_type === 'staff' ? '(員工)' : msg.sender_type === 'customer' ? '(客戶)' : ''}
                                </span>
                              </span>
                              <span style={{ fontSize: '0.8rem', color: '#666' }}>
                                {formatDate(msg.timestamp)}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.9rem' }}>
                              {getMessageIcon(msg.message_type)}{' '}
                              {msg.content || (msg.file_name ? `[${msg.file_name}]` : `[${msg.message_type}]`)}
                            </div>
                            {msg.file_url && (
                              <a
                                href={msg.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: '0.8rem',
                                  color: '#3b82f6',
                                  textDecoration: 'none'
                                }}
                              >
                                查看檔案 →
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  files.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                      還沒有檔案紀錄
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {files.map(file => (
                        <div key={file.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem 1rem',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>
                              {file.file_type === 'pdf' ? '📕' :
                               file.file_type === 'word' ? '📘' :
                               file.file_type === 'excel' ? '📗' :
                               file.file_type === 'image' ? '🖼️' :
                               file.file_type === 'video' ? '🎬' : '📄'}
                            </span>
                            <div>
                              <div style={{ fontWeight: '500' }}>{file.file_name}</div>
                              <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                {formatFileSize(file.file_size)} • {formatDate(file.created_at)} • {file.uploaded_by_name}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {!file.is_in_knowledge_base && (
                              <button
                                onClick={() => {/* TODO: 加入知識庫 */}}
                                style={{
                                  padding: '0.4rem 0.75rem',
                                  backgroundColor: '#8b5cf6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem'
                                }}
                              >
                                加入知識庫
                              </button>
                            )}
                            <a
                              href={file.public_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                padding: '0.4rem 0.75rem',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontSize: '0.8rem'
                              }}
                            >
                              下載
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 綁定 Modal */}
      {showBindModal && bindingGroup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            width: '90%',
            maxWidth: '500px'
          }}>
            <h3 style={{ margin: '0 0 1rem' }}>綁定 LINE 群組到洽談案</h3>
            <p style={{ color: '#666', marginBottom: '1rem' }}>
              群組: <strong>{bindingGroup.group_name}</strong>
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                選擇洽談案
              </label>
              <select
                id="prospect-select"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              >
                <option value="">-- 請選擇 --</option>
                {prospects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.client_name} / {p.project_name} ({p.stage})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowBindModal(false);
                  setBindingGroup(null);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  const select = document.getElementById('prospect-select');
                  if (select.value) {
                    bindGroupToProspect(bindingGroup.group_id, select.value);
                  } else {
                    alert('請選擇洽談案');
                  }
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                確認綁定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
