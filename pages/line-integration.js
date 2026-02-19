import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';

const PAGE_SIZE = 50;

const GROUP_TYPES = {
  prospect: { label: '客戶洽談', color: '#f59e0b', icon: '🎯' },
  internal: { label: '內部專屬', color: '#8b5cf6', icon: '👥' },
  team: { label: '團隊大群', color: '#3b82f6', icon: '🏢' },
  project: { label: '專案執行', color: '#10b981', icon: '📋' },
  other: { label: '其他', color: '#6b7280', icon: '💬' }
};

export default function LineIntegration() {
  const { user, loading: authLoading } = useSimpleAuth();
  const [activeTab, setActiveTab] = useState('messages');
  const [lineGroups, setLineGroups] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [projects, setProjects] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [aiSummary, setAiSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  // Pagination
  const [messageOffset, setMessageOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Search & filter
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState(null);

  useEffect(() => {
    if (!authLoading && user) {
      fetchLineGroups();
      fetchProspects();
      fetchProjects();
      fetchStaffUsers();
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (selectedGroup) {
      setSearchText('');
      setDateFrom('');
      setDateTo('');
      setMessageOffset(0);
      setHasMoreMessages(false);
      fetchMessages(selectedGroup.group_id, true);
      fetchFiles(selectedGroup.group_id);
      fetchGroupMembers(selectedGroup.group_id);
      setAiSummary(null);
    }
  }, [selectedGroup]);

  async function fetchLineGroups() {
    setLoading(true);
    try {
      const canViewAll = ['admin', 'leader', 'finance'].includes(user?.role);

      if (canViewAll) {
        // 管理層：看所有群組
        const { data, error } = await supabase
          .from('line_groups')
          .select(`
            *,
            prospects:prospect_id(id, client_name, project_name, stage),
            projects:project_id(id, client_name, project_name, project_code)
          `)
          .order('last_message_at', { ascending: false, nullsFirst: false });

        if (error) throw error;
        setLineGroups(data || []);
      } else {
        // 業務/PM：只看自己有在的群組
        const { data: memberships, error: memberError } = await supabase
          .from('line_group_members')
          .select('group_id')
          .eq('user_id', user.id);

        if (memberError) throw memberError;

        const myGroupIds = (memberships || []).map(m => m.group_id);

        // 也包含自己是 owner 的群組
        const { data: ownedGroups, error: ownedError } = await supabase
          .from('line_groups')
          .select('group_id')
          .eq('owner_user_id', user.id);

        if (!ownedError && ownedGroups) {
          ownedGroups.forEach(g => {
            if (!myGroupIds.includes(g.group_id)) myGroupIds.push(g.group_id);
          });
        }

        if (myGroupIds.length === 0) {
          setLineGroups([]);
          return;
        }

        const { data, error } = await supabase
          .from('line_groups')
          .select(`
            *,
            prospects:prospect_id(id, client_name, project_name, stage),
            projects:project_id(id, client_name, project_name, project_code)
          `)
          .in('group_id', myGroupIds)
          .order('last_message_at', { ascending: false, nullsFirst: false });

        if (error) throw error;
        setLineGroups(data || []);
      }
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
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setProspects(data || []);
    } catch (error) {
      console.error('取得洽談案錯誤:', error);
    }
  }

  async function fetchProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, client_name, project_name, project_code')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('取得專案錯誤:', error);
    }
  }

  async function fetchStaffUsers() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role')
        .in('role', ['admin', 'leader', 'pm', 'sales'])
        .order('name');

      if (error) throw error;
      setStaffUsers(data || []);
    } catch (error) {
      console.error('取得員工錯誤:', error);
    }
  }

  async function fetchGroupMembers(groupId) {
    try {
      const { data, error } = await supabase
        .from('line_group_members')
        .select(`
          *,
          users:user_id(id, name, role)
        `)
        .eq('group_id', groupId)
        .order('is_project_owner', { ascending: false });

      if (error) throw error;
      setGroupMembers(data || []);
    } catch (error) {
      console.error('取得群組成員錯誤:', error);
      setGroupMembers([]);
    }
  }

  async function fetchMessages(groupId, reset = false, overrideFilters) {
    try {
      const offset = reset ? 0 : messageOffset;
      const filters = overrideFilters || { searchText, dateFrom, dateTo };

      let query = supabase
        .from('line_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('timestamp', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (filters.searchText) {
        query = query.ilike('content', `%${filters.searchText}%`);
      }
      if (filters.dateFrom) {
        query = query.gte('timestamp', filters.dateFrom + 'T00:00:00');
      }
      if (filters.dateTo) {
        // Use next day to include the full "dateTo" day
        const nextDay = new Date(filters.dateTo);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt('timestamp', nextDay.toISOString().split('T')[0] + 'T00:00:00');
      }

      const { data, error } = await query;
      if (error) throw error;

      const results = data || [];
      if (reset) {
        setMessages(results);
        setMessageOffset(PAGE_SIZE);
      } else {
        setMessages(prev => [...prev, ...results]);
        setMessageOffset(offset + PAGE_SIZE);
      }
      setHasMoreMessages(results.length === PAGE_SIZE);
    } catch (error) {
      console.error('取得訊息錯誤:', error);
    }
  }

  async function loadMoreMessages() {
    if (!selectedGroup || loadingMore) return;
    setLoadingMore(true);
    await fetchMessages(selectedGroup.group_id, false);
    setLoadingMore(false);
  }

  function handleSearch() {
    if (!selectedGroup) return;
    setMessageOffset(0);
    fetchMessages(selectedGroup.group_id, true);
  }

  function handleClearFilters() {
    if (!selectedGroup) return;
    setSearchText('');
    setDateFrom('');
    setDateTo('');
    setMessageOffset(0);
    fetchMessages(selectedGroup.group_id, true, { searchText: '', dateFrom: '', dateTo: '' });
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

  async function updateGroupSettings(groupId, settings) {
    try {
      const { error } = await supabase
        .from('line_groups')
        .update(settings)
        .eq('group_id', groupId);

      if (error) throw error;

      alert('設定已儲存！');
      setShowSettingsModal(false);
      fetchLineGroups();
      if (selectedGroup?.group_id === groupId) {
        setSelectedGroup({ ...selectedGroup, ...settings });
      }
    } catch (error) {
      console.error('儲存失敗:', error);
      alert('儲存失敗: ' + error.message);
    }
  }

  async function generateAISummary(groupId) {
    setSummaryLoading(true);
    setAiSummary(null);
    try {
      const response = await fetch('/api/line/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId })
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.hint ? `${data.error}\n${data.hint}` : data.error);
      }

      // API 返回的結構可能是 { success, analysis } 或直接返回分析結果
      const analysisData = data.analysis || data;
      setAiSummary(analysisData);
      setActiveTab('summary');
    } catch (error) {
      console.error('AI 摘要失敗:', error);
      alert('AI 摘要失敗:\n' + error.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getMessageIcon(type) {
    const icons = { text: '💬', image: '🖼️', video: '🎬', audio: '🎵', file: '📄', sticker: '😀', location: '📍' };
    return icons[type] || '📨';
  }

  function getSenderStyle(type) {
    if (type === 'staff') return { bg: '#dbeafe', color: '#1d4ed8', label: '員工' };
    if (type === 'customer') return { bg: '#dcfce7', color: '#166534', label: '客戶' };
    return { bg: '#f3f4f6', color: '#374151', label: '' };
  }

  function getFileIcon(fileName) {
    if (!fileName) return '📄';
    const ext = fileName.split('.').pop().toLowerCase();
    const icons = {
      pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
      ppt: '📙', pptx: '📙', zip: '🗜️', rar: '🗜️', '7z': '🗜️', gz: '🗜️',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', bmp: '🖼️',
      mp4: '🎬', mov: '🎬', avi: '🎬',
      mp3: '🎵', m4a: '🎵', wav: '🎵',
      txt: '📝', json: '📝', xml: '📝', csv: '📝'
    };
    return icons[ext] || '📄';
  }

  function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function isImageFile(fileName) {
    if (!fileName) return false;
    const ext = fileName.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
  }

  const filteredGroups = filterType === 'all'
    ? lineGroups
    : lineGroups.filter(g => g.group_type === filterType);

  if (authLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>;
  }

  return (
    <div style={{ padding: '0' }}>
      {/* 頁面標題 */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#06c755' }}>●</span> LINE 群組管理
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.9rem' }}>
            管理所有 LINE 群組，查看對話紀錄、檔案，AI 自動摘要
          </p>
        </div>
      </div>

      {/* 篩選器 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilterType('all')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: filterType === 'all' ? '#1f2937' : '#f3f4f6',
            color: filterType === 'all' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '0.85rem'
          }}
        >
          全部 ({lineGroups.length})
        </button>
        {Object.entries(GROUP_TYPES).map(([key, val]) => {
          const count = lineGroups.filter(g => g.group_type === key).length;
          return (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: filterType === key ? val.color : '#f3f4f6',
                color: filterType === key ? 'white' : '#374151',
                border: 'none',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              {val.icon} {val.label} ({count})
            </button>
          );
        })}
      </div>

      {/* 主內容區 */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', minHeight: '600px' }}>
        {/* 左側: 群組列表 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', fontWeight: '600' }}>
            群組列表 ({filteredGroups.length})
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>載入中...</div>
            ) : filteredGroups.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
                <p>沒有符合的群組</p>
              </div>
            ) : (
              filteredGroups.map(group => {
                const typeInfo = GROUP_TYPES[group.group_type] || GROUP_TYPES.other;
                return (
                  <div
                    key={group.id}
                    onClick={() => setSelectedGroup(group)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      backgroundColor: selectedGroup?.id === group.id ? '#f0f9ff' : 'transparent'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                      <div style={{ fontWeight: '500', fontSize: '0.95rem' }}>
                        {group.group_name || '未命名群組'}
                      </div>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        backgroundColor: typeInfo.color,
                        color: 'white'
                      }}>
                        {typeInfo.icon}
                      </span>
                    </div>

                    {(group.prospects || group.projects) && (
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                        {group.prospects && <span>🎯 {group.prospects.client_name}</span>}
                        {group.prospects && group.projects && ' → '}
                        {group.projects && <span>📋 {group.projects.project_code}</span>}
                      </div>
                    )}

                    <div style={{ fontSize: '0.75rem', color: '#999', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{group.message_count || 0} 訊息</span>
                      <span>{formatDate(group.last_message_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 右側: 詳情 */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {!selectedGroup ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
              ← 選擇群組查看詳情
            </div>
          ) : (
            <>
              {/* 群組標題列 */}
              <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {selectedGroup.group_name}
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        backgroundColor: (GROUP_TYPES[selectedGroup.group_type] || GROUP_TYPES.other).color,
                        color: 'white'
                      }}>
                        {(GROUP_TYPES[selectedGroup.group_type] || GROUP_TYPES.other).label}
                      </span>
                    </h3>
                    <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                      {selectedGroup.prospects && <span>洽談: {selectedGroup.prospects.client_name} </span>}
                      {selectedGroup.projects && <span>專案: {selectedGroup.projects.project_code}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => generateAISummary(selectedGroup.group_id)}
                      disabled={summaryLoading}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#8b5cf6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: summaryLoading ? 'wait' : 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      {summaryLoading ? '分析中...' : '🤖 AI 摘要'}
                    </button>
                    <button
                      onClick={() => setShowSettingsModal(true)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#f3f4f6',
                        color: '#374151',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      ⚙️ 設定
                    </button>
                  </div>
                </div>

                {/* Tab 切換 */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  {['messages', 'members', 'files', 'summary'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: activeTab === tab ? '#3b82f6' : 'transparent',
                        color: activeTab === tab ? 'white' : '#666',
                        border: activeTab === tab ? 'none' : '1px solid #e5e7eb',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      {tab === 'messages' && `💬 訊息 (${messages.length}${hasMoreMessages ? '+' : ''})`}
                      {tab === 'members' && `👥 成員 (${groupMembers.length})`}
                      {tab === 'files' && `📁 檔案 (${files.length})`}
                      {tab === 'summary' && '📊 AI 摘要'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 內容區 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {activeTab === 'messages' && (
                  <div>
                    {/* Search & Filter Toolbar */}
                    <div style={{
                      display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center'
                    }}>
                      <input
                        type="text"
                        placeholder="搜尋訊息內容..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        style={{
                          flex: '1 1 180px', padding: '0.5rem 0.75rem',
                          border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem'
                        }}
                      />
                      <input
                        type="date" value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
                      />
                      <span style={{ color: '#999', fontSize: '0.85rem' }}>~</span>
                      <input
                        type="date" value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
                      />
                      <button onClick={handleSearch} style={{
                        padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: 'white',
                        border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem'
                      }}>搜尋</button>
                      {(searchText || dateFrom || dateTo) && (
                        <button onClick={handleClearFilters} style={{
                          padding: '0.5rem 1rem', backgroundColor: '#f3f4f6', color: '#374151',
                          border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem'
                        }}>清除</button>
                      )}
                    </div>

                    {messages.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                        {(searchText || dateFrom || dateTo) ? '找不到符合條件的訊息' : '還沒有訊息'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {messages.map(msg => {
                          const senderStyle = getSenderStyle(msg.sender_type);
                          return (
                            <div key={msg.id} style={{
                              padding: '0.75rem',
                              backgroundColor: senderStyle.bg,
                              borderRadius: '8px',
                              borderLeft: `3px solid ${senderStyle.color}`
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span style={{ fontWeight: '500', fontSize: '0.85rem' }}>
                                  {msg.sender_name}
                                  {senderStyle.label && (
                                    <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: senderStyle.color }}>
                                      ({senderStyle.label})
                                    </span>
                                  )}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>{formatDate(msg.timestamp)}</span>
                              </div>

                              {/* 訊息內容 */}
                              <div style={{ fontSize: '0.9rem' }}>
                                {msg.message_type === 'text' && msg.content}
                                {msg.message_type === 'image' && (
                                  <div>
                                    {msg.file_url ? (
                                      <img
                                        src={msg.file_url} alt="圖片"
                                        onClick={() => setLightboxUrl(msg.file_url)}
                                        style={{ maxWidth: '300px', maxHeight: '200px', display: 'block', marginTop: '0.25rem', borderRadius: '8px', cursor: 'pointer' }}
                                      />
                                    ) : (
                                      <span style={{ color: '#999' }}>🖼️ [圖片] (未儲存)</span>
                                    )}
                                  </div>
                                )}
                                {msg.message_type === 'video' && (
                                  <div>
                                    {msg.file_url ? (
                                      <video controls style={{ maxWidth: '300px', maxHeight: '200px', display: 'block', marginTop: '0.25rem', borderRadius: '8px' }}>
                                        <source src={msg.file_url} />
                                        瀏覽器不支援影片播放
                                      </video>
                                    ) : (
                                      <span style={{ color: '#999' }}>🎬 [影片] (未儲存)</span>
                                    )}
                                  </div>
                                )}
                                {msg.message_type === 'audio' && (
                                  <div>
                                    {msg.file_url ? (
                                      <audio controls style={{ maxWidth: '100%', marginTop: '0.25rem' }}>
                                        <source src={msg.file_url} />
                                        瀏覽器不支援音訊播放
                                      </audio>
                                    ) : (
                                      <span style={{ color: '#999' }}>🎵 [語音] {msg.duration ? `${msg.duration}秒` : ''} (未儲存)</span>
                                    )}
                                  </div>
                                )}
                                {msg.message_type === 'file' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                    <span style={{ fontSize: '1.2rem' }}>{getFileIcon(msg.file_name)}</span>
                                    <span>{msg.file_name || '[檔案]'}</span>
                                    {msg.file_size && <span style={{ color: '#999', fontSize: '0.8rem' }}>({formatFileSize(msg.file_size)})</span>}
                                    {msg.file_url ? (
                                      <a href={msg.file_url} target="_blank" rel="noopener noreferrer"
                                        style={{ padding: '0.2rem 0.6rem', backgroundColor: '#3b82f6', color: 'white', borderRadius: '4px', textDecoration: 'none', fontSize: '0.75rem' }}>
                                        下載
                                      </a>
                                    ) : (
                                      <span style={{ color: '#999', fontSize: '0.75rem' }}>(未儲存)</span>
                                    )}
                                  </div>
                                )}
                                {msg.message_type === 'sticker' && <span>😀 [貼圖]</span>}
                                {msg.message_type === 'location' && (
                                  <span>
                                    📍 {msg.address || '[位置]'}
                                    {msg.latitude && msg.longitude && (
                                      <a href={`https://www.google.com/maps?q=${msg.latitude},${msg.longitude}`}
                                        target="_blank" rel="noopener noreferrer"
                                        style={{ marginLeft: '0.5rem', color: '#3b82f6', fontSize: '0.8rem' }}>
                                        開啟地圖
                                      </a>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Load More */}
                        {hasMoreMessages && (
                          <button
                            onClick={loadMoreMessages}
                            disabled={loadingMore}
                            style={{
                              padding: '0.75rem', backgroundColor: '#f3f4f6', color: '#374151',
                              border: '1px solid #e5e7eb', borderRadius: '8px', cursor: loadingMore ? 'wait' : 'pointer',
                              fontSize: '0.85rem', textAlign: 'center', marginTop: '0.5rem'
                            }}
                          >
                            {loadingMore ? '載入中...' : '載入更多訊息'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'members' && (
                  <div>
                    {groupMembers.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
                        <p>尚未偵測到成員</p>
                        <p style={{ fontSize: '0.85rem', color: '#999' }}>當群組內有人發言時會自動偵測</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {/* 統計 */}
                        <div style={{
                          display: 'flex',
                          gap: '1rem',
                          padding: '0.75rem',
                          backgroundColor: '#f0f9ff',
                          borderRadius: '8px',
                          marginBottom: '0.5rem'
                        }}>
                          <span>
                            <strong>{groupMembers.filter(m => m.member_type === 'staff').length}</strong> 員工
                          </span>
                          <span>
                            <strong>{groupMembers.filter(m => m.member_type === 'customer').length}</strong> 客戶
                          </span>
                          <span>
                            <strong>{groupMembers.filter(m => m.is_project_owner).length}</strong> PO
                          </span>
                        </div>

                        {/* 成員列表 */}
                        {groupMembers.map(member => (
                          <div key={member.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.75rem 1rem',
                            backgroundColor: member.member_type === 'staff' ? '#dbeafe' : '#f3f4f6',
                            borderRadius: '8px',
                            borderLeft: member.is_project_owner ? '3px solid #f59e0b' : 'none'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                backgroundColor: member.member_type === 'staff' ? '#3b82f6' : '#10b981',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1rem',
                                fontWeight: '600'
                              }}>
                                {(member.display_name || member.users?.name || '?')[0]}
                              </div>
                              <div>
                                <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  {member.display_name || member.users?.name || '未知'}
                                  {member.is_project_owner && (
                                    <span style={{
                                      fontSize: '0.7rem',
                                      padding: '2px 6px',
                                      backgroundColor: '#fef3c7',
                                      color: '#92400e',
                                      borderRadius: '10px'
                                    }}>
                                      ⭐ PO
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                  {member.member_type === 'staff' ? (
                                    <>員工 · {member.users?.role || member.role || '未知角色'}</>
                                  ) : (
                                    <>客戶</>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#999', textAlign: 'right' }}>
                              <div>發言 {member.message_count || 0} 次</div>
                              {member.last_message_at && (
                                <div>最後: {formatDate(member.last_message_at)}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'files' && (
                  files.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>還沒有檔案</div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {files.map(file => (
                        <div key={file.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                            {/* Thumbnail or icon */}
                            {isImageFile(file.file_name) && file.public_url ? (
                              <img
                                src={file.public_url} alt={file.file_name}
                                onClick={() => setLightboxUrl(file.public_url)}
                                style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                              />
                            ) : (
                              <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>
                                {getFileIcon(file.file_name)}
                              </span>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: '500', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {file.file_name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                {file.uploaded_by_name} • {formatDate(file.created_at)}
                                {file.file_size ? ` • ${formatFileSize(file.file_size)}` : ''}
                              </div>
                            </div>
                          </div>
                          {file.public_url ? (
                            <a href={file.public_url} target="_blank" rel="noopener noreferrer"
                              style={{ padding: '0.4rem 0.75rem', backgroundColor: '#3b82f6', color: 'white', borderRadius: '6px', textDecoration: 'none', fontSize: '0.8rem', flexShrink: 0 }}>
                              下載
                            </a>
                          ) : (
                            <span style={{ padding: '0.4rem 0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '0.75rem', flexShrink: 0 }}>
                              未儲存
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}

                {activeTab === 'summary' && (
                  <div>
                    {summaryLoading ? (
                      <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🤖</div>
                        <p>AI 正在分析對話...</p>
                      </div>
                    ) : aiSummary ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '8px' }}>
                          <h4 style={{ margin: '0 0 0.5rem', color: '#166534' }}>📝 對話摘要</h4>
                          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{aiSummary.summary}</p>
                        </div>

                        {aiSummary.key_topics?.length > 0 && (
                          <div style={{ padding: '1rem', backgroundColor: '#eff6ff', borderRadius: '8px' }}>
                            <h4 style={{ margin: '0 0 0.5rem', color: '#1d4ed8' }}>🏷️ 主要話題</h4>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              {aiSummary.key_topics.map((topic, i) => (
                                <span key={i} style={{ padding: '0.25rem 0.75rem', backgroundColor: '#dbeafe', borderRadius: '20px', fontSize: '0.85rem' }}>{topic}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {aiSummary.action_items?.length > 0 && (
                          <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderRadius: '8px' }}>
                            <h4 style={{ margin: '0 0 0.5rem', color: '#92400e' }}>✅ 待辦事項</h4>
                            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                              {aiSummary.action_items.map((item, i) => <li key={i}>{item}</li>)}
                            </ul>
                          </div>
                        )}

                        {aiSummary.sentiment && (
                          <div style={{ padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
                            <h4 style={{ margin: '0 0 0.5rem' }}>😊 整體氛圍</h4>
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              borderRadius: '20px',
                              backgroundColor: aiSummary.sentiment === 'positive' ? '#dcfce7' : aiSummary.sentiment === 'negative' ? '#fee2e2' : '#f3f4f6'
                            }}>
                              {aiSummary.sentiment === 'positive' ? '😊 正面' : aiSummary.sentiment === 'negative' ? '😟 負面' : '😐 中性'}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                        <p>點擊「🤖 AI 摘要」按鈕生成對話分析</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1001, cursor: 'pointer'
          }}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: '1rem', right: '1rem',
              backgroundColor: 'rgba(255,255,255,0.2)', color: 'white',
              border: 'none', borderRadius: '50%', width: 36, height: 36,
              fontSize: '1.2rem', cursor: 'pointer'
            }}
          >✕</button>
          <img
            src={lightboxUrl} alt="預覽"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: '8px', cursor: 'default' }}
          />
        </div>
      )}

      {/* 群組設定 Modal */}
      {showSettingsModal && selectedGroup && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.5rem', width: '90%', maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 1rem' }}>群組設定</h3>
            <p style={{ color: '#666', marginBottom: '1rem' }}>群組: <strong>{selectedGroup.group_name}</strong></p>

            {/* 群組類型 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>群組類型</label>
              <select
                id="group-type"
                defaultValue={selectedGroup.group_type || 'prospect'}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
              >
                {Object.entries(GROUP_TYPES).map(([key, val]) => (
                  <option key={key} value={key}>{val.icon} {val.label}</option>
                ))}
              </select>
            </div>

            {/* 關聯洽談案 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>關聯洽談案</label>
              <select
                id="prospect-select"
                defaultValue={selectedGroup.prospect_id || ''}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
              >
                <option value="">-- 不關聯 --</option>
                {prospects.map(p => (
                  <option key={p.id} value={p.id}>{p.client_name} / {p.project_name} ({p.stage})</option>
                ))}
              </select>
            </div>

            {/* 關聯專案 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>關聯專案</label>
              <select
                id="project-select"
                defaultValue={selectedGroup.project_id || ''}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
              >
                <option value="">-- 不關聯 --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.project_code} - {p.client_name}</option>
                ))}
              </select>
            </div>

            {/* 群組成員（自動偵測） */}
            {groupMembers.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f0fdf4', borderRadius: '8px' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#166534' }}>
                  👥 群組內員工（自動偵測）
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {groupMembers.map(m => (
                    <span key={m.id} style={{
                      padding: '0.25rem 0.75rem',
                      backgroundColor: m.is_project_owner ? '#fef3c7' : '#e5e7eb',
                      borderRadius: '20px',
                      fontSize: '0.85rem',
                      border: m.is_project_owner ? '2px solid #f59e0b' : 'none'
                    }}>
                      {m.is_project_owner && '⭐ '}
                      {m.users?.name || '未知'}
                      <span style={{ color: '#666', marginLeft: '0.25rem' }}>({m.role})</span>
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.5rem' }}>
                  ⭐ = PO (業務自動偵測) • 會議提醒會發給所有群組成員
                </p>
              </div>
            )}

            {/* Project Owner (手動指定) */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Project Owner (手動指定)
              </label>
              <select
                id="owner-select"
                defaultValue={selectedGroup.owner_user_id || ''}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
              >
                <option value="">-- 自動偵測 --</option>
                {staffUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
              <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                如果群組沒有業務，可手動指定 PO
              </p>
            </div>

            {/* 備註 */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>備註</label>
              <textarea
                id="notes-input"
                defaultValue={selectedGroup.notes || ''}
                rows={3}
                style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', resize: 'vertical' }}
                placeholder="群組備註..."
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ padding: '0.75rem 1.5rem', backgroundColor: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  const groupType = document.getElementById('group-type').value;
                  const prospectId = document.getElementById('prospect-select').value || null;
                  const projectId = document.getElementById('project-select').value || null;
                  const ownerId = document.getElementById('owner-select').value || null;
                  const notes = document.getElementById('notes-input').value;
                  updateGroupSettings(selectedGroup.group_id, {
                    group_type: groupType,
                    prospect_id: prospectId,
                    project_id: projectId,
                    owner_user_id: ownerId,
                    notes: notes
                  });
                }}
                style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
              >
                儲存設定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
