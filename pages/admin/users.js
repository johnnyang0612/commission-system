import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../utils/auth';
import { getCurrentUser, USER_ROLES } from '../../utils/permissions';
import Layout from '../../components/Layout';

export default function AdminUsers() {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');

  useEffect(() => {
    checkAdminAccess();
  }, [authUser]);

  async function checkAdminAccess() {
    if (!authUser) {
      console.log('No auth user, redirecting to login');
      router.push('/login');
      return;
    }

    console.log('Auth user:', authUser);
    const userData = await getCurrentUser(authUser);
    console.log('User data:', userData);
    setCurrentUser(userData);

    // 暫時允許所有已登入用戶訪問，以便調試
    // if (userData?.role !== USER_ROLES.ADMIN) {
    //   alert('您沒有權限訪問此頁面');
    //   router.push('/');
    //   return;
    // }

    fetchUsers();
  }

  async function fetchUsers() {
    setLoading(true);
    console.log('正在獲取用戶列表...');
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    console.log('用戶資料:', data);
    console.log('錯誤:', error);
    
    if (error) {
      console.error('獲取用戶失敗:', error);
      alert('無法獲取用戶列表: ' + error.message);
    } else {
      setUsers(data || []);
      console.log(`已載入 ${data?.length || 0} 個用戶`);
    }
    setLoading(false);
  }

  async function updateUserRole(userId, newRole) {
    const { error } = await supabase
      .from('users')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) {
      alert('更新角色失敗: ' + error.message);
    } else {
      alert('角色更新成功');
      fetchUsers();
      setEditingUserId(null);
    }
  }

  async function deleteUser(userId, userEmail) {
    if (!confirm(`確定要刪除用戶 ${userEmail} 嗎？`)) return;

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) {
      alert('刪除失敗: ' + error.message);
    } else {
      alert('用戶已刪除');
      fetchUsers();
    }
  }

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case USER_ROLES.ADMIN: return '#e74c3c';
      case USER_ROLES.FINANCE: return '#f39c12';
      case USER_ROLES.LEADER: return '#3498db';
      case USER_ROLES.SALES: return '#27ae60';
      default: return '#95a5a6';
    }
  };

  const getRoleDisplayName = (role) => {
    switch (role) {
      case USER_ROLES.ADMIN: return '管理員';
      case USER_ROLES.FINANCE: return '財務';
      case USER_ROLES.LEADER: return '主管';
      case USER_ROLES.SALES: return '業務';
      default: return role;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#34495e',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '1rem'
          }}
        >
          ← 返回首頁
        </button>
        <button
          onClick={() => {
            console.log('當前用戶列表:', users);
            alert(`當前有 ${users.length} 個用戶\n第一個用戶: ${users[0]?.email || '無'}`);
          }}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '1rem'
          }}
        >
          檢查資料
        </button>
        <h1 style={{ display: 'inline-block', margin: 0 }}>用戶角色管理</h1>
      </div>

      <div style={{
        backgroundColor: '#fff3cd',
        border: '1px solid #ffeaa7',
        borderRadius: '4px',
        padding: '1rem',
        marginBottom: '2rem'
      }}>
        <strong>⚠️ 注意：</strong>
        <ul style={{ margin: '0.5rem 0' }}>
          <li>新註冊用戶預設角色為「業務」</li>
          <li>只有管理員可以修改用戶角色</li>
          <li>財務角色可以查看成本和利潤資料</li>
          <li>主管角色可以查看所有專案</li>
        </ul>
      </div>

      <table style={{
        width: '100%',
        backgroundColor: 'white',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f8f9fa' }}>
            <th style={{ padding: '1rem', textAlign: 'left' }}>姓名</th>
            <th style={{ padding: '1rem', textAlign: 'left' }}>Email</th>
            <th style={{ padding: '1rem', textAlign: 'left' }}>角色</th>
            <th style={{ padding: '1rem', textAlign: 'left' }}>註冊時間</th>
            <th style={{ padding: '1rem', textAlign: 'left' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} style={{ borderTop: '1px solid #dee2e6' }}>
              <td style={{ padding: '1rem' }}>
                {user.name || user.email.split('@')[0]}
                {user.id === currentUser?.id && (
                  <span style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.8rem',
                    color: '#e74c3c'
                  }}>（您）</span>
                )}
              </td>
              <td style={{ padding: '1rem' }}>{user.email}</td>
              <td style={{ padding: '1rem' }}>
                {editingUserId === user.id ? (
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #ddd'
                    }}
                  >
                    <option value={USER_ROLES.SALES}>業務</option>
                    <option value={USER_ROLES.LEADER}>主管</option>
                    <option value={USER_ROLES.FINANCE}>財務</option>
                    <option value={USER_ROLES.ADMIN}>管理員</option>
                  </select>
                ) : (
                  <span style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    backgroundColor: getRoleBadgeColor(user.role),
                    color: 'white',
                    borderRadius: '12px',
                    fontSize: '0.875rem'
                  }}>
                    {getRoleDisplayName(user.role)}
                  </span>
                )}
              </td>
              <td style={{ padding: '1rem' }}>
                {new Date(user.created_at).toLocaleDateString('zh-TW')}
              </td>
              <td style={{ padding: '1rem' }}>
                {user.id !== currentUser?.id && (
                  <>
                    {editingUserId === user.id ? (
                      <>
                        <button
                          onClick={() => updateUserRole(user.id, selectedRole)}
                          style={{
                            padding: '0.25rem 0.75rem',
                            backgroundColor: '#27ae60',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginRight: '0.5rem'
                          }}
                        >
                          儲存
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          style={{
                            padding: '0.25rem 0.75rem',
                            backgroundColor: '#95a5a6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingUserId(user.id);
                            setSelectedRole(user.role);
                          }}
                          style={{
                            padding: '0.25rem 0.75rem',
                            backgroundColor: '#3498db',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginRight: '0.5rem'
                          }}
                        >
                          編輯角色
                        </button>
                        <button
                          onClick={() => deleteUser(user.id, user.email)}
                          style={{
                            padding: '0.25rem 0.75rem',
                            backgroundColor: '#e74c3c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          刪除
                        </button>
                      </>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {users.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#95a5a6' }}>
          尚無用戶資料
        </div>
      )}
      </div>
    </Layout>
  );
}