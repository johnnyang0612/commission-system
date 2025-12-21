import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
// Layout is handled by _app.js
import { supabase } from '../utils/supabaseClient';
import { getCurrentUser, USER_ROLES, hasPermission, PERMISSIONS } from '../utils/permissions';
import styles from '../styles/UserManagement.module.css';

export default function UserManagement() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUserData, setEditingUserData] = useState(null);
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    name: '',
    role: 'sales',
    roles: ['sales'],
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
  const [selectedRoles, setSelectedRoles] = useState([]);

  useEffect(() => {
    checkUserAndLoadData();
  }, []);

  const checkUserAndLoadData = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/login');
        return;
      }

      const user = await getCurrentUser(authUser);
      setCurrentUser(user);
      await fetchUsers();
    } catch (error) {
      console.error('Error loading user data:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          supervisor:supervisor_id(name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const usersWithSupervisor = (data || []).map(user => ({
        ...user,
        supervisor_name: user.supervisor?.name || null
      }));
      setUsers(usersWithSupervisor);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleRoleUpdate = async (userId, primaryRole, roles = []) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          role: primaryRole,  // 主要角色（向後相容）
          roles: roles        // 所有角色
        })
        .eq('id', userId);

      if (error) throw error;

      alert('角色更新成功');
      setEditingUserId(null);
      setSelectedRoles([]);
      fetchUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      alert('角色更新失敗：' + error.message);
    }
  };

  const handleUserEdit = async (userData) => {
    try {
      const { error } = await supabase
        .from('users')
        .update(userData)
        .eq('id', editingUserData.id);
      
      if (error) throw error;
      
      alert('用戶資料更新成功');
      setEditingUserData(null);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      alert('更新失敗：' + error.message);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    
    try {
      const { error } = await supabase
        .from('users')
        .insert([newUserForm]);
      
      if (error) throw error;
      
      alert('新增用戶成功');
      setShowAddForm(false);
      setNewUserForm({
        email: '',
        name: '',
        role: 'sales',
        roles: ['sales'],
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
    } catch (error) {
      console.error('Error adding user:', error);
      alert('新增失敗：' + error.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('確定要刪除這個用戶嗎？')) return;
    
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);
      
      if (error) throw error;
      
      alert('用戶刪除成功');
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('刪除失敗：' + error.message);
    }
  };

  const canManageUsers = () => {
    return hasPermission(currentUser?.role, PERMISSIONS.MANAGE_USERS);
  };

  const canEditUserDetails = () => {
    return currentUser?.role === USER_ROLES.ADMIN || currentUser?.role === USER_ROLES.FINANCE;
  };

  const canChangeRoles = () => {
    return currentUser?.role === USER_ROLES.ADMIN;
  };

  const canDeleteUsers = () => {
    return currentUser?.role === USER_ROLES.ADMIN;
  };

  const ROLE_NAMES = {
    [USER_ROLES.ADMIN]: '管理員',
    [USER_ROLES.FINANCE]: '財務',
    [USER_ROLES.LEADER]: '主管',
    [USER_ROLES.PM]: 'PM',
    [USER_ROLES.SALES]: '業務'
  };

  const getRoleDisplayName = (role) => {
    return ROLE_NAMES[role] || role;
  };

  const getRolesDisplayName = (roles, role) => {
    // 優先使用 roles 陣列，fallback 到 role
    const userRoles = roles && roles.length > 0 ? roles : (role ? [role] : []);
    if (userRoles.length === 0) return '-';
    return userRoles.map(r => ROLE_NAMES[r] || r).join(' + ');
  };

  const toggleRole = (role, currentRoles, setRoles) => {
    if (currentRoles.includes(role)) {
      // 移除角色（但至少保留一個）
      if (currentRoles.length > 1) {
        setRoles(currentRoles.filter(r => r !== role));
      }
    } else {
      setRoles([...currentRoles, role]);
    }
  };

  if (loading) {
    return <div className={styles.loading}>載入中...</div>;
  }

  if (!canManageUsers()) {
    return (
      <div className={styles.accessDenied}>
        <h2>權限不足</h2>
        <p>您沒有權限存取用戶管理功能</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h2>用戶管理</h2>
          <div className={styles.headerActions}>
            {canManageUsers() && (
              <button 
                className={styles.addButton}
                onClick={() => setShowAddForm(true)}
              >
                + 新增用戶
              </button>
            )}
          </div>
        </div>

        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>姓名</th>
                <th>Email</th>
                <th>角色</th>
                <th>電話</th>
                <th>手機</th>
                <th>銀行帳戶</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    {editingUserId === user.id && canChangeRoles() ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                          {[USER_ROLES.SALES, USER_ROLES.PM, USER_ROLES.LEADER, USER_ROLES.FINANCE, USER_ROLES.ADMIN].map(role => (
                            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                              <input
                                type="checkbox"
                                checked={selectedRoles.includes(role)}
                                onChange={() => toggleRole(role, selectedRoles, setSelectedRoles)}
                              />
                              {ROLE_NAMES[role]}
                            </label>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className={styles.saveButton}
                            onClick={() => handleRoleUpdate(user.id, selectedRoles[0], selectedRoles)}
                            disabled={selectedRoles.length === 0}
                          >
                            保存
                          </button>
                          <button
                            className={styles.cancelButton}
                            onClick={() => {
                              setEditingUserId(null);
                              setSelectedRoles([]);
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span
                        className={styles.roleBadge}
                        data-role={user.role}
                      >
                        {getRolesDisplayName(user.roles, user.role)}
                      </span>
                    )}
                  </td>
                  <td>{user.phone_number || '-'}</td>
                  <td>{user.mobile_number || '-'}</td>
                  <td>
                    {user.bank_name && user.account_number 
                      ? `${user.bank_name} ${user.account_number}` 
                      : '-'
                    }
                  </td>
                  <td>
                    <div className={styles.actionButtons}>
                      {canEditUserDetails() && (
                        <button
                          className={styles.editButton}
                          onClick={() => setEditingUserData(user)}
                        >
                          編輯
                        </button>
                      )}
                      {canChangeRoles() && editingUserId !== user.id && (
                        <button
                          className={styles.roleButton}
                          onClick={() => {
                            setEditingUserId(user.id);
                            // 使用 roles 陣列或 fallback 到 role
                            const userRoles = user.roles && user.roles.length > 0 ? user.roles : (user.role ? [user.role] : ['sales']);
                            setSelectedRoles(userRoles);
                          }}
                        >
                          改角色
                        </button>
                      )}
                      {canDeleteUsers() && user.id !== currentUser?.id && (
                        <button
                          className={styles.deleteButton}
                          onClick={() => handleDeleteUser(user.id)}
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 新增用戶表單 */}
        {showAddForm && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <div className={styles.modalHeader}>
                <h2>新增用戶</h2>
                <button 
                  className={styles.closeButton}
                  onClick={() => setShowAddForm(false)}
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={handleAddUser}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>姓名 *</label>
                    <input
                      type="text"
                      value={newUserForm.name}
                      onChange={(e) => setNewUserForm({...newUserForm, name: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>Email *</label>
                    <input
                      type="email"
                      value={newUserForm.email}
                      onChange={(e) => setNewUserForm({...newUserForm, email: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>角色 * (可多選)</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', padding: '0.5rem 0' }}>
                      {[USER_ROLES.SALES, USER_ROLES.PM, USER_ROLES.LEADER].map(role => (
                        <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={newUserForm.roles.includes(role)}
                            onChange={() => {
                              const newRoles = newUserForm.roles.includes(role)
                                ? newUserForm.roles.filter(r => r !== role)
                                : [...newUserForm.roles, role];
                              // 確保至少一個角色
                              if (newRoles.length > 0) {
                                setNewUserForm({...newUserForm, roles: newRoles, role: newRoles[0]});
                              }
                            }}
                          />
                          {ROLE_NAMES[role]}
                        </label>
                      ))}
                      {currentUser?.role === USER_ROLES.ADMIN && (
                        <>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={newUserForm.roles.includes(USER_ROLES.FINANCE)}
                              onChange={() => {
                                const role = USER_ROLES.FINANCE;
                                const newRoles = newUserForm.roles.includes(role)
                                  ? newUserForm.roles.filter(r => r !== role)
                                  : [...newUserForm.roles, role];
                                if (newRoles.length > 0) {
                                  setNewUserForm({...newUserForm, roles: newRoles, role: newRoles[0]});
                                }
                              }}
                            />
                            財務
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={newUserForm.roles.includes(USER_ROLES.ADMIN)}
                              onChange={() => {
                                const role = USER_ROLES.ADMIN;
                                const newRoles = newUserForm.roles.includes(role)
                                  ? newUserForm.roles.filter(r => r !== role)
                                  : [...newUserForm.roles, role];
                                if (newRoles.length > 0) {
                                  setNewUserForm({...newUserForm, roles: newRoles, role: newRoles[0]});
                                }
                              }}
                            />
                            管理員
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>電話</label>
                    <input
                      type="text"
                      value={newUserForm.phone_number}
                      onChange={(e) => setNewUserForm({...newUserForm, phone_number: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>手機</label>
                    <input
                      type="text"
                      value={newUserForm.mobile_number}
                      onChange={(e) => setNewUserForm({...newUserForm, mobile_number: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>身分證字號</label>
                    <input
                      type="text"
                      value={newUserForm.national_id}
                      onChange={(e) => setNewUserForm({...newUserForm, national_id: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>銀行名稱</label>
                    <input
                      type="text"
                      value={newUserForm.bank_name}
                      onChange={(e) => setNewUserForm({...newUserForm, bank_name: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>銀行代碼</label>
                    <input
                      type="text"
                      value={newUserForm.bank_code}
                      onChange={(e) => setNewUserForm({...newUserForm, bank_code: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>帳戶號碼</label>
                    <input
                      type="text"
                      value={newUserForm.account_number}
                      onChange={(e) => setNewUserForm({...newUserForm, account_number: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>帳戶名稱</label>
                    <input
                      type="text"
                      value={newUserForm.account_name}
                      onChange={(e) => setNewUserForm({...newUserForm, account_name: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>戶籍地址</label>
                    <input
                      type="text"
                      value={newUserForm.registered_address}
                      onChange={(e) => setNewUserForm({...newUserForm, registered_address: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>通訊地址</label>
                    <input
                      type="text"
                      value={newUserForm.mailing_address}
                      onChange={(e) => setNewUserForm({...newUserForm, mailing_address: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className={styles.modalFooter}>
                  <button 
                    type="button" 
                    onClick={() => setShowAddForm(false)}
                  >
                    取消
                  </button>
                  <button 
                    type="submit" 
                    className={styles.submitButton}
                  >
                    新增
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 編輯用戶表單 */}
        {editingUserData && (
          <div className={styles.modal}>
            <div className={styles.modalContent}>
              <div className={styles.modalHeader}>
                <h2>編輯用戶資料</h2>
                <button 
                  className={styles.closeButton}
                  onClick={() => setEditingUserData(null)}
                >
                  ×
                </button>
              </div>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                handleUserEdit(editingUserData);
              }}>
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>姓名 *</label>
                    <input
                      type="text"
                      value={editingUserData.name}
                      onChange={(e) => setEditingUserData({...editingUserData, name: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>Email *</label>
                    <input
                      type="email"
                      value={editingUserData.email}
                      onChange={(e) => setEditingUserData({...editingUserData, email: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>電話</label>
                    <input
                      type="text"
                      value={editingUserData.phone_number || ''}
                      onChange={(e) => setEditingUserData({...editingUserData, phone_number: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>手機</label>
                    <input
                      type="text"
                      value={editingUserData.mobile_number || ''}
                      onChange={(e) => setEditingUserData({...editingUserData, mobile_number: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>身分證字號</label>
                    <input
                      type="text"
                      value={editingUserData.national_id || ''}
                      onChange={(e) => setEditingUserData({...editingUserData, national_id: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>銀行名稱</label>
                    <input
                      type="text"
                      value={editingUserData.bank_name || ''}
                      onChange={(e) => setEditingUserData({...editingUserData, bank_name: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>銀行代碼</label>
                    <input
                      type="text"
                      value={editingUserData.bank_code || ''}
                      onChange={(e) => setEditingUserData({...editingUserData, bank_code: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>帳戶號碼</label>
                    <input
                      type="text"
                      value={editingUserData.account_number || ''}
                      onChange={(e) => setEditingUserData({...editingUserData, account_number: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup}>
                    <label>帳戶名稱</label>
                    <input
                      type="text"
                      value={editingUserData.account_name || ''}
                      onChange={(e) => setEditingUserData({...editingUserData, account_name: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>戶籍地址</label>
                    <input
                      type="text"
                      value={editingUserData.registered_address || ''}
                      onChange={(e) => setEditingUserData({...editingUserData, registered_address: e.target.value})}
                    />
                  </div>
                  
                  <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                    <label>通訊地址</label>
                    <input
                      type="text"
                      value={editingUserData.mailing_address || ''}
                      onChange={(e) => setEditingUserData({...editingUserData, mailing_address: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className={styles.modalFooter}>
                  <button 
                    type="button" 
                    onClick={() => setEditingUserData(null)}
                  >
                    取消
                  </button>
                  <button 
                    type="submit" 
                    className={styles.submitButton}
                  >
                    更新
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
  );
}