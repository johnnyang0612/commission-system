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

  const handleRoleUpdate = async (userId, newRole) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);
      
      if (error) throw error;
      
      alert('角色更新成功');
      setEditingUserId(null);
      setSelectedRole('');
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

  const getRoleDisplayName = (role) => {
    const roleNames = {
      [USER_ROLES.ADMIN]: '管理員',
      [USER_ROLES.FINANCE]: '財務',
      [USER_ROLES.LEADER]: '主管',
      [USER_ROLES.SALES]: '業務'
    };
    return roleNames[role] || role;
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
                      <div className={styles.roleEdit}>
                        <select
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value)}
                        >
                          <option value="">選擇角色</option>
                          <option value={USER_ROLES.ADMIN}>管理員</option>
                          <option value={USER_ROLES.FINANCE}>財務</option>
                          <option value={USER_ROLES.LEADER}>主管</option>
                          <option value={USER_ROLES.SALES}>業務</option>
                        </select>
                        <button 
                          className={styles.saveButton}
                          onClick={() => handleRoleUpdate(user.id, selectedRole)}
                          disabled={!selectedRole}
                        >
                          保存
                        </button>
                        <button 
                          className={styles.cancelButton}
                          onClick={() => {
                            setEditingUserId(null);
                            setSelectedRole('');
                          }}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <span 
                        className={styles.roleBadge}
                        data-role={user.role}
                      >
                        {getRoleDisplayName(user.role)}
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
                            setSelectedRole(user.role);
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
                    <label>角色 *</label>
                    <select
                      value={newUserForm.role}
                      onChange={(e) => setNewUserForm({...newUserForm, role: e.target.value})}
                      required
                    >
                      <option value={USER_ROLES.SALES}>業務</option>
                      <option value={USER_ROLES.LEADER}>主管</option>
                      {currentUser?.role === USER_ROLES.ADMIN && (
                        <>
                          <option value={USER_ROLES.FINANCE}>財務</option>
                          <option value={USER_ROLES.ADMIN}>管理員</option>
                        </>
                      )}
                    </select>
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