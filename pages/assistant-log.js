import { useState, useEffect, useCallback } from 'react';
import { useSimpleAuth } from '../utils/simpleAuth';
import { supabase } from '../utils/supabaseClient';

export default function AssistantLog() {
  const { user, loading: authLoading } = useSimpleAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  // Filters
  const [filterChannel, setFilterChannel] = useState('');
  const [filterCommandType, setFilterCommandType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  const isAuthorized = user && (user.role === 'admin' || user.role === 'leader');

  const fetchLogs = useCallback(async (pageNum = 0) => {
    if (!supabase || !isAuthorized) return;
    setLoading(true);

    try {
      let query = supabase
        .from('assistant_commands')
        .select('*')
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (filterChannel) query = query.eq('channel', filterChannel);
      if (filterCommandType) query = query.eq('command_type', filterCommandType);
      if (filterStatus) query = query.eq('result_status', filterStatus);
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom + 'T00:00:00');
      if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59');

      const { data, error } = await query;

      if (error) {
        console.error('取得助理指令記錄失敗:', error);
        setLogs([]);
      } else {
        setLogs(data || []);
        setHasMore((data || []).length === PAGE_SIZE);
      }
    } catch (e) {
      console.error('取得助理指令記錄異常:', e);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, filterChannel, filterCommandType, filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (isAuthorized) {
      setPage(0);
      fetchLogs(0);
    }
  }, [isAuthorized, fetchLogs]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    fetchLogs(newPage);
    setExpandedId(null);
  };

  const handleFilterApply = () => {
    setPage(0);
    fetchLogs(0);
  };

  const handleFilterReset = () => {
    setFilterChannel('');
    setFilterCommandType('');
    setFilterStatus('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPage(0);
    // fetchLogs will be called by the useEffect when filters change
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '-';
    try {
      return new Date(isoStr).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    } catch {
      return isoStr;
    }
  };

  const renderStatusBadge = (status) => {
    const map = {
      pending: { label: '待處理', bg: '#e0e0e0', color: '#555' },
      executing: { label: '執行中', bg: '#e3f2fd', color: '#1565c0' },
      success: { label: '成功', bg: '#e8f5e9', color: '#2e7d32' },
      failed: { label: '失敗', bg: '#ffebee', color: '#c62828' },
      cancelled: { label: '已取消', bg: '#fff3e0', color: '#e65100' }
    };
    const s = map[status] || { label: status || '未知', bg: '#f5f5f5', color: '#999' };
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color
      }}>
        {s.label}
      </span>
    );
  };

  const renderChannelBadge = (channel) => {
    const map = {
      line_group: { label: 'LINE 群組', bg: '#e8f5e9', color: '#2e7d32' },
      line_private: { label: 'LINE 私訊', bg: '#e3f2fd', color: '#1565c0' },
      web_chat: { label: '網頁聊天', bg: '#f3e5f5', color: '#6a1b9a' },
      system: { label: '系統', bg: '#f5f5f5', color: '#757575' }
    };
    const c = map[channel] || { label: channel || '未知', bg: '#f5f5f5', color: '#999' };
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: c.bg,
        color: c.color
      }}>
        {c.label}
      </span>
    );
  };

  const renderJson = (obj) => {
    if (!obj) return <span style={{ color: '#999' }}>-</span>;
    try {
      const str = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
      return (
        <pre style={{
          background: '#f8f9fa',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          margin: '4px 0',
          overflowX: 'auto',
          maxHeight: '200px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}>
          {str}
        </pre>
      );
    } catch {
      return <span>{String(obj)}</span>;
    }
  };

  if (authLoading) {
    return (
      <div style={pageStyles.container}>
        <div style={pageStyles.loading}>載入中...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!isAuthorized) {
    return (
      <div style={pageStyles.container}>
        <div style={pageStyles.card}>
          <h2 style={{ margin: 0, color: '#c62828' }}>權限不足</h2>
          <p style={{ color: '#666', marginTop: '8px' }}>只有管理員和主管可以檢視助理指令記錄。</p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyles.container}>
      <h1 style={pageStyles.title}>助理指令記錄</h1>
      <p style={pageStyles.subtitle}>檢視所有 AI 助理操作的稽核紀錄</p>

      {/* Filters */}
      <div style={pageStyles.filterBar}>
        <div style={pageStyles.filterGroup}>
          <label style={pageStyles.filterLabel}>頻道</label>
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            style={pageStyles.filterSelect}
          >
            <option value="">全部</option>
            <option value="line_group">LINE 群組</option>
            <option value="line_private">LINE 私訊</option>
            <option value="web_chat">網頁聊天</option>
            <option value="system">系統</option>
          </select>
        </div>

        <div style={pageStyles.filterGroup}>
          <label style={pageStyles.filterLabel}>指令類型</label>
          <select
            value={filterCommandType}
            onChange={(e) => setFilterCommandType(e.target.value)}
            style={pageStyles.filterSelect}
          >
            <option value="">全部</option>
            <option value="bind_email">綁定 Email</option>
            <option value="create_meeting">建立會議</option>
            <option value="query">查詢</option>
            <option value="generate_doc">文件生成</option>
            <option value="create_project">建立專案</option>
            <option value="update_project">更新專案</option>
          </select>
        </div>

        <div style={pageStyles.filterGroup}>
          <label style={pageStyles.filterLabel}>狀態</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={pageStyles.filterSelect}
          >
            <option value="">全部</option>
            <option value="pending">待處理</option>
            <option value="executing">執行中</option>
            <option value="success">成功</option>
            <option value="failed">失敗</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>

        <div style={pageStyles.filterGroup}>
          <label style={pageStyles.filterLabel}>開始日期</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            style={pageStyles.filterInput}
          />
        </div>

        <div style={pageStyles.filterGroup}>
          <label style={pageStyles.filterLabel}>結束日期</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            style={pageStyles.filterInput}
          />
        </div>

        <div style={pageStyles.filterActions}>
          <button onClick={handleFilterApply} style={pageStyles.btnPrimary}>
            篩選
          </button>
          <button onClick={handleFilterReset} style={pageStyles.btnSecondary}>
            重置
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={pageStyles.card}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            載入中...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            尚無指令記錄
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={pageStyles.table}>
                <thead>
                  <tr>
                    <th style={pageStyles.th}>時間</th>
                    <th style={pageStyles.th}>頻道</th>
                    <th style={pageStyles.th}>指令類型</th>
                    <th style={pageStyles.th}>輸入</th>
                    <th style={pageStyles.th}>狀態</th>
                    <th style={pageStyles.th}>完成時間</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <>
                      <tr
                        key={log.id}
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        style={{
                          ...pageStyles.tr,
                          cursor: 'pointer',
                          backgroundColor: expandedId === log.id ? '#f5f5f5' : 'transparent'
                        }}
                      >
                        <td style={pageStyles.td}>{formatTime(log.created_at)}</td>
                        <td style={pageStyles.td}>{renderChannelBadge(log.channel)}</td>
                        <td style={pageStyles.td}>
                          <span style={{ fontWeight: 500 }}>{log.command_type || '-'}</span>
                        </td>
                        <td style={{ ...pageStyles.td, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.raw_input || '-'}
                        </td>
                        <td style={pageStyles.td}>{renderStatusBadge(log.result_status)}</td>
                        <td style={pageStyles.td}>{formatTime(log.completed_at)}</td>
                      </tr>
                      {expandedId === log.id && (
                        <tr key={`${log.id}-detail`}>
                          <td colSpan={6} style={{ padding: '16px 20px', backgroundColor: '#fafafa', borderBottom: '1px solid #eee' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                              <div>
                                <strong style={{ fontSize: '13px', color: '#555' }}>解析意圖 (parsed_intent)</strong>
                                {renderJson(log.parsed_intent)}
                              </div>
                              <div>
                                <strong style={{ fontSize: '13px', color: '#555' }}>執行計畫 (execution_plan)</strong>
                                {renderJson(log.execution_plan)}
                              </div>
                              <div>
                                <strong style={{ fontSize: '13px', color: '#555' }}>結果資料 (result_data)</strong>
                                {renderJson(log.result_data)}
                              </div>
                              <div>
                                <strong style={{ fontSize: '13px', color: '#555' }}>錯誤訊息</strong>
                                {log.error_message
                                  ? <pre style={{ background: '#ffebee', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', color: '#c62828', margin: '4px 0', whiteSpace: 'pre-wrap' }}>{log.error_message}</pre>
                                  : <span style={{ color: '#999', display: 'block', marginTop: '4px' }}>-</span>
                                }
                              </div>
                              <div>
                                <strong style={{ fontSize: '13px', color: '#555' }}>Actor 用戶 ID</strong>
                                <div style={{ marginTop: '4px', fontSize: '13px', color: '#333' }}>{log.actor_user_id || '-'}</div>
                              </div>
                              <div>
                                <strong style={{ fontSize: '13px', color: '#555' }}>來源群組 ID</strong>
                                <div style={{ marginTop: '4px', fontSize: '13px', color: '#333' }}>{log.source_group_id || '-'}</div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={pageStyles.pagination}>
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 0}
                style={{
                  ...pageStyles.btnSecondary,
                  opacity: page === 0 ? 0.5 : 1,
                  cursor: page === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                上一頁
              </button>
              <span style={{ fontSize: '14px', color: '#666' }}>
                第 {page + 1} 頁 ({logs.length} 筆)
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={!hasMore}
                style={{
                  ...pageStyles.btnSecondary,
                  opacity: !hasMore ? 0.5 : 1,
                  cursor: !hasMore ? 'not-allowed' : 'pointer'
                }}
              >
                下一頁
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const pageStyles = {
  container: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto'
  },
  loading: {
    textAlign: 'center',
    padding: '60px',
    color: '#999',
    fontSize: '16px'
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1a1a2e',
    margin: '0 0 4px 0'
  },
  subtitle: {
    fontSize: '14px',
    color: '#888',
    margin: '0 0 24px 0'
  },
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'flex-end',
    padding: '16px 20px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    marginBottom: '16px'
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#666'
  },
  filterSelect: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '13px',
    backgroundColor: '#fff',
    minWidth: '120px'
  },
  filterInput: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '13px',
    backgroundColor: '#fff'
  },
  filterActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end'
  },
  btnPrimary: {
    padding: '7px 16px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#1a73e8',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  btnSecondary: {
    padding: '7px 16px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    backgroundColor: '#fff',
    color: '#333',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    overflow: 'hidden'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    borderBottom: '2px solid #eee',
    color: '#666',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    backgroundColor: '#fafafa'
  },
  tr: {
    borderBottom: '1px solid #f0f0f0',
    transition: 'background-color 0.15s'
  },
  td: {
    padding: '10px 16px',
    verticalAlign: 'middle',
    borderBottom: '1px solid #f0f0f0',
    color: '#333'
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    padding: '16px'
  }
};
