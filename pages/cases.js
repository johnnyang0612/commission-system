import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { USER_ROLES } from '../utils/permissions';
import { useSimpleAuth } from '../utils/simpleAuth';

// 統一的案件階段
const STAGES = [
  { id: 'lead', label: '初談', color: '#94a3b8', type: 'prospect' },
  { id: 'proposal', label: '提案', color: '#8b5cf6', type: 'prospect' },
  { id: 'quote', label: '報價', color: '#3b82f6', type: 'prospect' },
  { id: 'negotiation', label: '談判', color: '#f59e0b', type: 'prospect' },
  { id: 'pending_sign', label: '待簽約', color: '#10b981', type: 'prospect' },
  { id: 'signed', label: '已成交', color: '#059669', type: 'project' },
  { id: 'in_progress', label: '進行中', color: '#0891b2', type: 'project' },
  { id: 'completed', label: '已結案', color: '#6b7280', type: 'project' },
  { id: 'lost', label: '已失單', color: '#ef4444', type: 'prospect' },
];

export default function Cases() {
  const router = useRouter();
  const { user: authUserData, loading: authLoading } = useSimpleAuth();
  const [cases, setCases] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [filter, setFilter] = useState('all'); // all, prospect, project
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    client_name: '',
    project_name: '',
    estimated_amount: '',
    owner_id: '',
    stage: 'lead',
    expected_sign_date: '',
    note: ''
  });

  useEffect(() => {
    if (!authLoading && authUserData) {
      loadData(authUserData);
    }
  }, [authLoading, authUserData]);

  async function loadData(user) {
    setLoading(true);
    setCurrentUser(user);

    await Promise.all([
      fetchCases(user),
      fetchUsers()
    ]);

    setLoading(false);
  }

  async function fetchCases(user) {
    if (!supabase) return;

    // 獲取洽談中的案件
    const { data: prospects, error: pError } = await supabase
      .from('prospects')
      .select('*')
      .order('updated_at', { ascending: false });

    // 獲取已成交的專案
    const { data: projects, error: projError } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (pError) console.error('Prospects error:', pError);
    if (projError) console.error('Projects error:', projError);

    // 合併並標準化資料
    const allCases = [
      ...(prospects || []).map(p => ({
        id: p.id,
        type: 'prospect',
        client_name: p.client_name,
        project_name: p.project_name,
        amount: p.estimated_amount,
        stage: mapProspectStage(p.stage),
        stage_label: p.stage,
        owner_id: p.owner_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        expected_sign_date: p.expected_sign_date,
        close_rate: p.close_rate,
        note: p.note,
        original: p
      })),
      ...(projects || []).map(p => ({
        id: p.id,
        type: 'project',
        client_name: p.client_name,
        project_name: p.project_name,
        amount: p.amount,
        stage: 'signed',
        stage_label: '已成交',
        owner_id: p.assigned_to,
        created_at: p.created_at,
        updated_at: p.updated_at,
        project_code: p.project_code,
        payment_template: p.payment_template,
        original: p
      }))
    ];

    // 根據角色過濾
    let filteredCases = allCases;
    if (user?.role === USER_ROLES.SALES) {
      filteredCases = allCases.filter(c => c.owner_id === user?.id);
    }

    setCases(filteredCases);
  }

  function mapProspectStage(stage) {
    const mapping = {
      '初談': 'lead',
      '提案': 'proposal',
      '報價': 'quote',
      '談判': 'negotiation',
      '待簽約': 'pending_sign',
      '已轉換': 'signed',
      '已失單': 'lost'
    };
    return mapping[stage] || 'lead';
  }

  async function fetchUsers() {
    if (!supabase) return;
    const { data } = await supabase
      .from('users')
      .select('id, name, email, role')
      .order('name');
    setUsers(data || []);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;

    const stageMapping = {
      'lead': '初談',
      'proposal': '提案',
      'quote': '報價',
      'negotiation': '談判',
      'pending_sign': '待簽約'
    };

    const { error } = await supabase
      .from('prospects')
      .insert([{
        client_name: formData.client_name,
        project_name: formData.project_name,
        estimated_amount: parseFloat(formData.estimated_amount) || 0,
        owner_id: formData.owner_id || currentUser?.id,
        stage: stageMapping[formData.stage] || '初談',
        expected_sign_date: formData.expected_sign_date || null,
        note: formData.note,
        close_rate: 'medium'
      }]);

    if (error) {
      alert('新增失敗: ' + error.message);
    } else {
      setShowModal(false);
      resetForm();
      loadData();
    }
  }

  function resetForm() {
    setFormData({
      client_name: '',
      project_name: '',
      estimated_amount: '',
      owner_id: '',
      stage: 'lead',
      expected_sign_date: '',
      note: ''
    });
  }

  function handleCaseClick(caseItem) {
    if (caseItem.type === 'project') {
      router.push(`/projects/${caseItem.id}`);
    } else {
      // 未來可以開啟洽談詳情
      router.push(`/prospects?id=${caseItem.id}`);
    }
  }

  function getStageInfo(stageId) {
    return STAGES.find(s => s.id === stageId) || STAGES[0];
  }

  function getUserName(userId) {
    const user = users.find(u => u.id === userId);
    return user?.name || '-';
  }

  // 過濾案件
  const filteredCases = cases.filter(c => {
    // 類型過濾
    if (filter === 'prospect' && c.type !== 'prospect') return false;
    if (filter === 'project' && c.type !== 'project') return false;

    // 搜尋過濾
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        c.client_name?.toLowerCase().includes(search) ||
        c.project_name?.toLowerCase().includes(search) ||
        c.project_code?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // 統計數據
  const stats = {
    total: cases.length,
    prospects: cases.filter(c => c.type === 'prospect' && c.stage !== 'lost').length,
    projects: cases.filter(c => c.type === 'project').length,
    totalValue: cases.filter(c => c.stage !== 'lost').reduce((sum, c) => sum + (c.amount || 0), 0)
  };

  const styles = {
    page: { padding: 0 },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
      flexWrap: 'wrap',
      gap: 16
    },
    title: { fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' },
    addBtn: {
      padding: '12px 24px',
      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      color: 'white',
      border: 'none',
      borderRadius: 10,
      fontWeight: 600,
      cursor: 'pointer',
      fontSize: 14,
      boxShadow: '0 2px 8px rgba(37,99,235,0.3)'
    },
    statsRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 12,
      marginBottom: 20
    },
    statCard: {
      background: 'white',
      borderRadius: 12,
      padding: 16,
      textAlign: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    },
    statValue: { fontSize: 24, fontWeight: 700, color: '#1e293b' },
    statLabel: { fontSize: 13, color: '#64748b', marginTop: 4 },
    filterRow: {
      display: 'flex',
      gap: 12,
      marginBottom: 16,
      flexWrap: 'wrap',
      alignItems: 'center'
    },
    filterBtn: {
      padding: '8px 16px',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      transition: 'all 0.2s'
    },
    searchBox: {
      flex: 1,
      minWidth: 200,
      padding: '10px 14px',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      fontSize: 14
    },
    card: {
      background: 'white',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      cursor: 'pointer',
      transition: 'all 0.2s',
      border: '1px solid #f1f5f9'
    },
    cardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
      gap: 12
    },
    clientName: { fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 4 },
    projectName: { fontSize: 14, color: '#64748b' },
    badge: {
      padding: '4px 12px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      whiteSpace: 'nowrap'
    },
    cardBody: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
    amount: { fontSize: 18, fontWeight: 700, color: '#2563eb' },
    meta: { fontSize: 13, color: '#64748b' },
    modal: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      zIndex: 2000,
      padding: 0
    },
    modalContent: {
      background: 'white',
      borderRadius: '16px 16px 0 0',
      width: '100%',
      maxWidth: 500,
      maxHeight: '90vh',
      overflow: 'auto'
    },
    modalHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 20px',
      borderBottom: '1px solid #e2e8f0',
      position: 'sticky',
      top: 0,
      background: 'white'
    },
    modalBody: { padding: 20 },
    formGroup: { marginBottom: 16 },
    label: { display: 'block', fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 6 },
    input: {
      width: '100%',
      padding: '12px 14px',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      fontSize: 15,
      boxSizing: 'border-box'
    },
    submitBtn: {
      width: '100%',
      padding: 14,
      background: '#2563eb',
      color: 'white',
      border: 'none',
      borderRadius: 10,
      fontSize: 16,
      fontWeight: 600,
      cursor: 'pointer',
      marginTop: 8
    },
    empty: {
      textAlign: 'center',
      padding: 60,
      color: '#94a3b8'
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>載入中...</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* 頁面標題 */}
      <div style={styles.header}>
        <h1 style={styles.title}>案件管理</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => router.push('/ai-generator?tab=smart-project')}
            style={{
              padding: '12px 20px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(139,92,246,0.3)'
            }}
          >
            🚀 智能建案
          </button>
          <button onClick={() => setShowModal(true)} style={styles.addBtn}>
            + 新增案件
          </button>
        </div>
      </div>

      {/* 統計卡片 */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.total}</div>
          <div style={styles.statLabel}>全部案件</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#8b5cf6' }}>{stats.prospects}</div>
          <div style={styles.statLabel}>洽談中</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#10b981' }}>{stats.projects}</div>
          <div style={styles.statLabel}>已成交</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#f59e0b' }}>
            {(stats.totalValue / 10000).toFixed(0)}萬
          </div>
          <div style={styles.statLabel}>總金額</div>
        </div>
      </div>

      {/* 過濾器 */}
      <div style={styles.filterRow}>
        {[
          { key: 'all', label: '全部' },
          { key: 'prospect', label: '洽談中' },
          { key: 'project', label: '已成交' }
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              ...styles.filterBtn,
              background: filter === f.key ? '#2563eb' : '#f1f5f9',
              color: filter === f.key ? 'white' : '#64748b'
            }}
          >
            {f.label}
          </button>
        ))}
        <input
          type="text"
          placeholder="搜尋客戶或專案..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchBox}
        />
      </div>

      {/* 案件列表 */}
      {filteredCases.length === 0 ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📁</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>尚無案件</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>點擊上方按鈕新增第一個案件</div>
        </div>
      ) : (
        filteredCases.map(caseItem => {
          const stageInfo = getStageInfo(caseItem.stage);
          return (
            <div
              key={`${caseItem.type}-${caseItem.id}`}
              style={styles.card}
              onClick={() => handleCaseClick(caseItem)}
            >
              <div style={styles.cardHeader}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.clientName}>{caseItem.client_name}</div>
                  <div style={styles.projectName}>
                    {caseItem.project_name}
                    {caseItem.project_code && ` · ${caseItem.project_code}`}
                  </div>
                </div>
                <span style={{
                  ...styles.badge,
                  background: `${stageInfo.color}20`,
                  color: stageInfo.color
                }}>
                  {caseItem.stage_label || stageInfo.label}
                </span>
              </div>
              <div style={styles.cardBody}>
                <div style={styles.amount}>
                  NT$ {(caseItem.amount || 0).toLocaleString()}
                </div>
                <div style={styles.meta}>
                  {getUserName(caseItem.owner_id)}
                  {caseItem.expected_sign_date && ` · 預計 ${caseItem.expected_sign_date}`}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* 新增案件 Modal */}
      {showModal && (
        <div style={styles.modal} onClick={() => setShowModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>新增案件</h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 24, color: '#94a3b8', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>客戶名稱 *</label>
                <input
                  type="text"
                  required
                  value={formData.client_name}
                  onChange={e => setFormData({ ...formData, client_name: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>專案名稱 *</label>
                <input
                  type="text"
                  required
                  value={formData.project_name}
                  onChange={e => setFormData({ ...formData, project_name: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>預估金額</label>
                <input
                  type="number"
                  value={formData.estimated_amount}
                  onChange={e => setFormData({ ...formData, estimated_amount: e.target.value })}
                  placeholder="請輸入金額"
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>負責業務</label>
                <select
                  value={formData.owner_id}
                  onChange={e => setFormData({ ...formData, owner_id: e.target.value })}
                  style={styles.input}
                >
                  <option value="">選擇業務...</option>
                  {users.filter(u => ['sales', 'leader', 'pm'].includes(u.role)).map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>目前階段</label>
                <select
                  value={formData.stage}
                  onChange={e => setFormData({ ...formData, stage: e.target.value })}
                  style={styles.input}
                >
                  {STAGES.filter(s => s.type === 'prospect' && s.id !== 'lost').map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>預計簽約日</label>
                <input
                  type="date"
                  value={formData.expected_sign_date}
                  onChange={e => setFormData({ ...formData, expected_sign_date: e.target.value })}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>備註</label>
                <textarea
                  value={formData.note}
                  onChange={e => setFormData({ ...formData, note: e.target.value })}
                  rows={3}
                  style={{ ...styles.input, resize: 'vertical' }}
                />
              </div>
              <button type="submit" style={styles.submitBtn}>
                確認新增
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 響應式樣式 */}
      <style jsx>{`
        @media (min-width: 769px) {
          div[style*="modalContent"] {
            border-radius: 16px !important;
            max-height: 80vh !important;
          }
          div[style*="modal"] {
            align-items: center !important;
            padding: 20px !important;
          }
        }
      `}</style>
    </div>
  );
}
