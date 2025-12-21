import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { USER_ROLES } from '../utils/permissions';

export default function Settings() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [users, setUsers] = useState([]);
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    checkAccess();
  }, []);

  async function checkAccess() {
    // 從 simpleAuth 取得當前用戶
    const storedUser = localStorage.getItem('currentUser');
    if (!storedUser) {
      router.push('/login');
      return;
    }

    const userData = JSON.parse(storedUser);
    setCurrentUser(userData);
    setCurrentRole(userData.role);

    // admin 和 leader 都可以進入設定頁面
    if (userData.role !== USER_ROLES.ADMIN && userData.role !== USER_ROLES.LEADER) {
      router.push('/dashboard');
      return;
    }

    await loadData();
    setLoading(false);
  }

  const isAdmin = currentRole === USER_ROLES.ADMIN;

  async function loadData() {
    await Promise.all([
      fetchUsers(),
      fetchDocuments()
    ]);
  }

  async function fetchUsers() {
    if (!supabase) return;
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    setUsers(data || []);
  }

  async function fetchDocuments() {
    if (!supabase) return;
    const { data } = await supabase
      .from('document_embeddings')
      .select('*, project_documents(*)')
      .order('created_at', { ascending: false })
      .limit(20);
    setDocuments(data || []);
  }

  const ROLE_NAMES = {
    admin: '管理員',
    finance: '財務',
    leader: '主管',
    pm: 'PM',
    sales: '業務'
  };

  const ROLE_COLORS = {
    admin: { bg: '#fef2f2', color: '#dc2626' },
    finance: { bg: '#fefce8', color: '#ca8a04' },
    leader: { bg: '#eff6ff', color: '#2563eb' },
    pm: { bg: '#f5f3ff', color: '#7c3aed' },
    sales: { bg: '#ecfdf5', color: '#059669' }
  };

  async function handleRoleChange(userId, newRole) {
    if (!supabase) return;

    // Leader 不能將用戶設為 admin
    if (!isAdmin && newRole === 'admin') {
      alert('只有管理員可以設定管理員角色');
      return;
    }

    const { error } = await supabase
      .from('users')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) {
      alert('更新失敗: ' + error.message);
    } else {
      fetchUsers();
    }
  }

  async function handleDeleteUser(userId) {
    if (!confirm('確定要刪除這個用戶嗎？')) return;

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) {
      alert('刪除失敗: ' + error.message);
    } else {
      fetchUsers();
    }
  }

  // 根據角色顯示不同的 tabs
  const tabs = [
    { id: 'users', label: '用戶管理', icon: '👥' },
    ...(isAdmin ? [{ id: 'knowledge', label: '知識庫', icon: '📚' }] : [])
  ];

  const styles = {
    page: { padding: 0 },
    header: { marginBottom: 20 },
    title: { fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' },
    tabs: {
      display: 'flex',
      gap: 8,
      marginBottom: 20
    },
    tab: {
      padding: '10px 20px',
      border: 'none',
      borderRadius: 10,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      transition: 'all 0.2s'
    },
    section: {
      background: 'white',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    },
    userCard: {
      padding: 16,
      borderBottom: '1px solid #f1f5f9',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    },
    userInfo: { flex: 1, minWidth: 200 },
    userName: { fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 4 },
    userEmail: { fontSize: 13, color: '#64748b' },
    userActions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
    roleSelect: {
      padding: '6px 12px',
      border: '1px solid #e2e8f0',
      borderRadius: 6,
      fontSize: 13,
      background: 'white'
    },
    deleteBtn: {
      padding: '6px 12px',
      background: '#fee2e2',
      color: '#dc2626',
      border: 'none',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 13
    },
    badge: {
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 500
    },
    docCard: {
      padding: 16,
      borderBottom: '1px solid #f1f5f9'
    },
    docName: { fontSize: 14, fontWeight: 500, color: '#1e293b', marginBottom: 4 },
    docMeta: { fontSize: 13, color: '#64748b' },
    emptyState: {
      textAlign: 'center',
      padding: 40,
      color: '#94a3b8'
    },
    infoBox: {
      background: '#f0f9ff',
      border: '1px solid #bae6fd',
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
      fontSize: 14,
      color: '#0369a1'
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
        <h1 style={styles.title}>系統設定</h1>
      </div>

      {/* 標籤切換 */}
      <div style={styles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              background: activeTab === tab.id ? '#2563eb' : '#f1f5f9',
              color: activeTab === tab.id ? 'white' : '#64748b'
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 用戶管理 Tab */}
      {activeTab === 'users' && (
        <div style={styles.section}>
          {users.length === 0 ? (
            <div style={styles.emptyState}>尚無用戶</div>
          ) : (
            users.map(user => {
              const roleStyle = ROLE_COLORS[user.role] || ROLE_COLORS.sales;
              return (
                <div key={user.id} style={styles.userCard}>
                  <div style={styles.userInfo}>
                    <div style={styles.userName}>{user.name || '未設定姓名'}</div>
                    <div style={styles.userEmail}>{user.email}</div>
                  </div>
                  <div style={styles.userActions}>
                    <span style={{
                      ...styles.badge,
                      background: roleStyle.bg,
                      color: roleStyle.color
                    }}>
                      {ROLE_NAMES[user.role] || user.role}
                    </span>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      style={styles.roleSelect}
                      disabled={user.id === currentUser?.id}
                    >
                      {Object.entries(ROLE_NAMES)
                        .filter(([value]) => isAdmin || value !== 'admin')
                        .map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                    {user.id !== currentUser?.id && isAdmin && (
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        style={styles.deleteBtn}
                      >
                        刪除
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 知識庫 Tab */}
      {activeTab === 'knowledge' && (
        <>
          <div style={styles.infoBox}>
            知識庫用於 AI 文件生成功能。上傳提案書、規格書等文件後，AI 可以參考這些範本生成新文件。
          </div>
          <div style={styles.section}>
            {documents.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📚</div>
                <div>尚無知識庫文件</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>
                  請先在專案中上傳文件，再到此處加入知識庫
                </div>
              </div>
            ) : (
              documents.map(doc => (
                <div key={doc.id} style={styles.docCard}>
                  <div style={styles.docName}>{doc.document_name}</div>
                  <div style={styles.docMeta}>
                    {doc.document_type} · {doc.client_name || '未知客戶'}
                    · {new Date(doc.created_at).toLocaleDateString('zh-TW')}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
