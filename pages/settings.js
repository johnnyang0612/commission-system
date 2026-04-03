import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';
import { USER_ROLES } from '../utils/permissions';

export default function Settings() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useSimpleAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [documents, setDocuments] = useState([]);

  // 等角色從 DB 載入完成再判斷（避免 onAuthStateChange 的 sales 預設值誤判）
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      router.push('/login');
      return;
    }

    // 如果角色還是預設的 sales 且剛載入，等 500ms 讓 DB 查詢完成
    if (authUser.role === 'sales' && !roleChecked) {
      const timer = setTimeout(() => setRoleChecked(true), 600);
      return () => clearTimeout(timer);
    }

    // 角色確定了，檢查權限
    if (authUser.role !== USER_ROLES.ADMIN && authUser.role !== USER_ROLES.LEADER) {
      router.push('/dashboard');
      return;
    }

    loadData().then(() => setLoading(false));
  }, [authLoading, authUser, roleChecked]);

  const isAdmin = authUser?.role === USER_ROLES.ADMIN;
  const isLeader = authUser?.role === USER_ROLES.LEADER;

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

  // 多角色切換
  async function handleToggleRole(userId, toggleRole, currentRoles) {
    if (!supabase) return;

    // Leader 不能設定 admin 角色
    if (!isAdmin && toggleRole === 'admin') {
      alert('只有管理員可以設定管理員角色');
      return;
    }

    const roles = currentRoles || [];
    let newRoles;

    if (roles.includes(toggleRole)) {
      // 移除角色（但至少保留一個）
      newRoles = roles.filter(r => r !== toggleRole);
      if (newRoles.length === 0) {
        alert('用戶至少需要一個角色');
        return;
      }
    } else {
      // 新增角色
      newRoles = [...roles, toggleRole];
    }

    // 主要角色設為陣列中優先級最高的
    const rolePriority = ['admin', 'finance', 'leader', 'pm', 'sales'];
    const primaryRole = rolePriority.find(r => newRoles.includes(r)) || newRoles[0];

    const { error } = await supabase
      .from('users')
      .update({
        role: primaryRole,
        roles: newRoles
      })
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
    { id: 'contacts', label: '聯絡人管理', icon: '📇' },
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

  if (authLoading || loading) {
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

      {/* Google Calendar 授權提示 */}
      {isAdmin && router.query.google_auth === 'success' && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: 16, marginBottom: 16, color: '#065f46' }}>
          ✅ Google Calendar 授權成功！現在可以建立 Google Meet 會議了。
        </div>
      )}
      {isAdmin && router.query.google_auth === 'error' && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 16, marginBottom: 16, color: '#991b1b' }}>
          ❌ Google Calendar 授權失敗：{router.query.message || '未知錯誤'}
        </div>
      )}

      {/* Google Calendar 授權按鈕（僅 admin）*/}
      {isAdmin && activeTab === 'users' && (
        <div style={{ background: 'white', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>Google Calendar 整合</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>授權後，川輝AI助理建立會議時會自動建立 Google Calendar 事件 + Meet 連結</div>
          </div>
          <button
            onClick={async () => {
              const res = await fetch('/api/google/auth-url');
              const data = await res.json();
              if (data.url) window.location.href = data.url;
              else alert('產生授權連結失敗：' + (data.error || '未知錯誤'));
            }}
            style={{ padding: '10px 20px', background: '#4285f4', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            授權 Google Calendar
          </button>
        </div>
      )}

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={styles.userName}>{user.name || '未設定姓名'}</span>
                      {user.line_user_id ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          background: '#dcfce7',
                          color: '#16a34a',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 500
                        }}>
                          💬 LINE 已綁定
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          background: '#f1f5f9',
                          color: '#94a3b8',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 500
                        }}>
                          LINE 未綁定
                        </span>
                      )}
                    </div>
                    <div style={styles.userEmail}>{user.email}</div>
                  </div>
                  <div style={styles.userActions}>
                    {/* 顯示所有角色標籤 */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(user.roles && user.roles.length > 0 ? user.roles : [user.role]).map(r => {
                        const rs = ROLE_COLORS[r] || ROLE_COLORS.sales;
                        return (
                          <span key={r} style={{
                            ...styles.badge,
                            background: rs.bg,
                            color: rs.color
                          }}>
                            {ROLE_NAMES[r] || r}
                          </span>
                        );
                      })}
                    </div>
                    {/* 多角色勾選 */}
                    {user.id !== authUser?.id && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 8 }}>
                        {Object.entries(ROLE_NAMES)
                          .filter(([value]) => isAdmin || value !== 'admin')
                          .map(([value, label]) => {
                            const userRoles = user.roles || [user.role];
                            const isChecked = userRoles.includes(value);
                            return (
                              <label key={value} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                                fontSize: 12,
                                padding: '4px 8px',
                                borderRadius: 4,
                                background: isChecked ? '#e0f2fe' : '#f1f5f9',
                                border: isChecked ? '1px solid #0ea5e9' : '1px solid #e2e8f0'
                              }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleRole(user.id, value, userRoles)}
                                  style={{ margin: 0 }}
                                />
                                {label}
                              </label>
                            );
                          })}
                      </div>
                    )}
                    {user.id !== authUser?.id && isAdmin && (
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

      {/* 聯絡人管理 Tab */}
      {activeTab === 'contacts' && (
        <div style={styles.section}>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📇</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 8 }}>聯絡人身份管理</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
              管理 LINE 群組成員身份、綁定內部員工、標記 VIP 客戶
            </div>
            <button
              onClick={() => router.push('/contact-management')}
              style={{
                padding: '12px 24px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              前往聯絡人管理
            </button>
          </div>
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
