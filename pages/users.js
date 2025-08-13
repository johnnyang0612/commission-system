import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'sales'
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        supervisor:supervisor_id (name)
      `)
      .order('created_at', { ascending: false });
    
    if (error) console.error(error);
    else {
      const usersWithSupervisor = (data || []).map(user => ({
        ...user,
        supervisor_name: user.supervisor?.name || null
      }));
      setUsers(usersWithSupervisor);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;
    
    const { error } = await supabase
      .from('users')
      .insert([formData]);
    
    if (error) {
      console.error(error);
      alert('新增失敗');
    } else {
      alert('新增成功');
      setShowAddForm(false);
      setFormData({
        email: '',
        name: '',
        role: 'sales'
      });
      fetchUsers();
    }
  }

  const getRoleLabel = (role) => {
    const labels = {
      'admin': '管理員',
      'finance': '財務',
      'leader': '主管',
      'sales': '業務'
    };
    return labels[role] || role;
  };

  const getRoleColor = (role) => {
    const colors = {
      'admin': '#e74c3c',
      'finance': '#f39c12',
      'leader': '#3498db',
      'sales': '#27ae60'
    };
    return colors[role] || '#95a5a6';
  };

  return (
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '2rem' }}>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            {showAddForm ? '取消' : '新增人員'}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSubmit} style={{
            backgroundColor: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  姓名
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
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
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
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
                  角色
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
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
            </div>

            <button
              type="submit"
              style={{
                marginTop: '1rem',
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

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>姓名</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>Email</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>角色</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>主管</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>建立時間</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '1rem' }}>{user.name}</td>
                  <td style={{ padding: '1rem' }}>{user.email}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '4px',
                      backgroundColor: getRoleColor(user.role),
                      color: 'white',
                      fontSize: '0.875rem'
                    }}>
                      {getRoleLabel(user.role)}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {user.supervisor_name || '-'}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {new Date(user.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <button
                      onClick={() => window.open(`/users/${user.id}`, '_blank')}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#3498db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      查看詳情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {users.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
              暫無人員資料
            </div>
          )}
        </div>
      </div>
  );
}