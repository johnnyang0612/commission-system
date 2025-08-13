import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../utils/supabaseClient';
import { useSimpleAuth } from '../../utils/simpleAuth';
import { getCurrentUser, USER_ROLES } from '../../utils/permissions';

export default function AdminUsers() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useSimpleAuth();
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    name: '',
    role: 'sales',
    phone_number: '',
    mobile_number: '',
    registered_address: '',
    mailing_address: '',
    national_id: '',
    bank_name: '',
    bank_code: '',
    account_number: '',
    account_name: ''
  });

  useEffect(() => {
    if (!authLoading && authUser) {
      checkAdminAccess();
    } else if (!authLoading && !authUser) {
      router.push('/login');
    }
  }, [authUser, authLoading]);

  async function checkAdminAccess() {
    console.log('Auth user:', authUser);
    // authUser 已經包含了從 users 表獲取的完整資料
    setCurrentUser(authUser);
    
    // 檢查權限（暫時允許所有已登入用戶訪問以便調試）
    console.log('User role:', authUser?.role);
    
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
      console.log('用戶列表詳細:', data?.map(u => ({ id: u.id, email: u.email, role: u.role })));
    }
    setLoading(false);
  }

  async function addNewUser(e) {
    e.preventDefault();
    
    // 生成唯一 ID (使用 email 的 hash 或 timestamp)
    const userId = `pre_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('正在新增用戶:', { userId, ...newUserForm });
    
    const { data, error } = await supabase
      .from('users')
      .insert([{
        id: userId,
        ...newUserForm,
        created_at: new Date().toISOString()
      }])
      .select();

    console.log('新增用戶結果:', { data, error });

    if (error) {
      console.error('新增用戶失敗詳細錯誤:', error);
      alert('新增用戶失敗: ' + error.message + '\n詳細: ' + JSON.stringify(error, null, 2));
    } else {
      alert('用戶新增成功！當用戶使用相同 Email 登入時會自動合併帳號。');
      setShowAddForm(false);
      setNewUserForm({
        email: '',
        name: '',
        role: 'sales',
        phone_number: '',
        mobile_number: '',
        registered_address: '',
        mailing_address: '',
        national_id: '',
        bank_name: '',
        bank_code: '',
        account_number: '',
        account_name: ''
      });
      fetchUsers();
    }
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

  if (authLoading || loading) {
    return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>
    );
  }

  if (!authUser) {
    return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>請先登入</div>
    );
  }

  return (
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
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '1rem'
          }}
        >
          {showAddForm ? '取消新增' : '+ 新增用戶'}
        </button>
        <h1 style={{ display: 'inline-block', margin: 0 }}>用戶角色管理</h1>
      </div>

      {showAddForm && (
        <form onSubmit={addNewUser} style={{
          backgroundColor: '#f8f9fa',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem'
        }}>
          <h3 style={{ marginBottom: '1rem', color: '#2c3e50' }}>新增用戶</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Email *
              </label>
              <input
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({...newUserForm, email: e.target.value})}
                required
                placeholder="user@example.com"
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
                姓名 *
              </label>
              <input
                type="text"
                value={newUserForm.name}
                onChange={(e) => setNewUserForm({...newUserForm, name: e.target.value})}
                required
                placeholder="張三"
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
                角色 *
              </label>
              <select
                value={newUserForm.role}
                onChange={(e) => setNewUserForm({...newUserForm, role: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                <option value="sales">業務</option>
                <option value="leader">主管</option>
                <option value="finance">財務</option>
                <option value="admin">管理員</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                手機號碼
              </label>
              <input
                type="tel"
                value={newUserForm.mobile_number}
                onChange={(e) => setNewUserForm({...newUserForm, mobile_number: e.target.value})}
                placeholder="0912345678"
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
                身分證字號
              </label>
              <input
                type="text"
                value={newUserForm.national_id}
                onChange={(e) => setNewUserForm({...newUserForm, national_id: e.target.value})}
                placeholder="A123456789"
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
                戶籍地址
              </label>
              <input
                type="text"
                value={newUserForm.registered_address}
                onChange={(e) => setNewUserForm({...newUserForm, registered_address: e.target.value})}
                placeholder="台北市..."
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                銀行名稱
              </label>
              <input
                type="text"
                value={newUserForm.bank_name}
                onChange={(e) => setNewUserForm({...newUserForm, bank_name: e.target.value})}
                placeholder="例：台灣銀行"
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
                銀行代碼
              </label>
              <input
                type="text"
                value={newUserForm.bank_code}
                onChange={(e) => setNewUserForm({...newUserForm, bank_code: e.target.value})}
                placeholder="例：004"
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
                帳號
              </label>
              <input
                type="text"
                value={newUserForm.account_number}
                onChange={(e) => setNewUserForm({...newUserForm, account_number: e.target.value})}
                placeholder="銀行帳號"
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
                戶名
              </label>
              <input
                type="text"
                value={newUserForm.account_name}
                onChange={(e) => setNewUserForm({...newUserForm, account_name: e.target.value})}
                placeholder="帳戶持有人姓名"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>
          
          <button
            type="submit"
            style={{
              padding: '0.75rem 2rem',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            確認新增
          </button>
        </form>
      )}
      

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
  );
}