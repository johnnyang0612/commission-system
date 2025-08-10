import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';

export default function UserDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [user, setUser] = useState(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [commissionRecords, setCommissionRecords] = useState([]);
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [subordinates, setSubordinates] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [stats, setStats] = useState({});

  useEffect(() => {
    if (id) {
      fetchUser();
      fetchCommissionRecords();
      fetchPaymentRecords();
      fetchSubordinates();
      fetchAllUsers();
      calculateStats();
    }
  }, [id]);

  async function fetchUser() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) console.error(error);
    else {
      setUser(data);
      setEditFormData(data);
    }
  }

  async function fetchCommissionRecords() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('commissions')
      .select(`
        *,
        project:project_id (
          project_code,
          client_name,
          amount
        )
      `)
      .eq('user_id', id)
      .order('created_at', { ascending: false });
    
    if (error) console.error(error);
    else setCommissionRecords(data || []);
  }

  async function fetchPaymentRecords() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('commission_payments')
      .select('*')
      .eq('user_id', id)
      .order('payment_date', { ascending: false });
    
    if (error) console.error(error);
    else setPaymentRecords(data || []);
  }

  async function fetchSubordinates() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('supervisor_id', id);
    
    if (error) console.error(error);
    else setSubordinates(data || []);
  }

  async function fetchAllUsers() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('role', ['sales', 'leader'])
      .order('name');
    
    if (error) console.error(error);
    else setAllUsers(data || []);
  }

  async function calculateStats() {
    if (!supabase) return;
    
    // 計算統計數據
    const { data: commissions, error: commError } = await supabase
      .from('commissions')
      .select('amount, status')
      .eq('user_id', id);
    
    const { data: payments, error: payError } = await supabase
      .from('commission_payments')
      .select('amount')
      .eq('user_id', id);
    
    if (!commError && commissions) {
      const totalCommission = commissions.reduce((sum, c) => sum + (c.amount || 0), 0);
      const paidCommission = commissions.filter(c => c.status === 'paid').reduce((sum, c) => sum + (c.amount || 0), 0);
      const pendingCommission = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + (c.amount || 0), 0);
      const totalPaid = payments ? payments.reduce((sum, p) => sum + (p.amount || 0), 0) : 0;
      
      setStats({
        totalCommission,
        paidCommission,
        pendingCommission,
        totalPaid,
        projectCount: commissions.length
      });
    }
  }

  async function updateUser(e) {
    e.preventDefault();
    if (!supabase) return;
    
    const { error } = await supabase
      .from('users')
      .update(editFormData)
      .eq('id', id);
    
    if (error) {
      console.error(error);
      alert('更新失敗');
    } else {
      alert('更新成功');
      setShowEditForm(false);
      fetchUser();
    }
  }

  async function addSubordinate(subordinateId) {
    if (!supabase) return;
    
    const { error } = await supabase
      .from('users')
      .update({ supervisor_id: id })
      .eq('id', subordinateId);
    
    if (error) {
      console.error(error);
      alert('分派失敗');
    } else {
      alert('下屬分派成功');
      fetchSubordinates();
      fetchAllUsers();
    }
  }

  async function removeSubordinate(subordinateId) {
    if (!supabase) return;
    
    const { error } = await supabase
      .from('users')
      .update({ supervisor_id: null })
      .eq('id', subordinateId);
    
    if (error) {
      console.error(error);
      alert('移除失敗');
    } else {
      alert('下屬移除成功');
      fetchSubordinates();
      fetchAllUsers();
    }
  }

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>
    );
  }

  const getRoleLabel = (role) => {
    const labels = {
      'admin': '管理員',
      'accountant': '財務',
      'leader': '主管',
      'sales': '業務'
    };
    return labels[role] || role;
  };

  return (
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => router.push('/users')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ← 返回人員列表
        </button>
      </div>

      {/* 基本資訊 */}
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0 }}>人員詳情：{user.name}</h2>
          <button
            onClick={() => setShowEditForm(!showEditForm)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f39c12',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {showEditForm ? '取消編輯' : '編輯資料'}
          </button>
        </div>

        {showEditForm ? (
          <form onSubmit={updateUser}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  姓名 *
                </label>
                <input
                  type="text"
                  value={editFormData.name || ''}
                  onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Email *
                </label>
                <input
                  type="email"
                  value={editFormData.email || ''}
                  onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                  required
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  電話
                </label>
                <input
                  type="tel"
                  value={editFormData.phone || ''}
                  onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  角色
                </label>
                <select
                  value={editFormData.role || ''}
                  onChange={(e) => setEditFormData({...editFormData, role: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                >
                  <option value="sales">業務</option>
                  <option value="leader">主管</option>
                  <option value="accountant">財務</option>
                  <option value="admin">管理員</option>
                </select>
              </div>
            </div>

            <h4 style={{ marginTop: '2rem', marginBottom: '1rem' }}>撥款帳戶資訊</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  銀行名稱
                </label>
                <input
                  type="text"
                  value={editFormData.bank_name || ''}
                  onChange={(e) => setEditFormData({...editFormData, bank_name: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  銀行代碼
                </label>
                <input
                  type="text"
                  value={editFormData.bank_code || ''}
                  onChange={(e) => setEditFormData({...editFormData, bank_code: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  帳戶號碼
                </label>
                <input
                  type="text"
                  value={editFormData.account_number || ''}
                  onChange={(e) => setEditFormData({...editFormData, account_number: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  戶名
                </label>
                <input
                  type="text"
                  value={editFormData.account_name || ''}
                  onChange={(e) => setEditFormData({...editFormData, account_name: e.target.value})}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
            </div>

            <button
              type="submit"
              style={{
                marginTop: '2rem',
                padding: '0.75rem 2rem',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              確認更新
            </button>
          </form>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
            <div>
              <h4 style={{ color: '#6c757d', marginBottom: '1rem' }}>基本資訊</h4>
              <p><strong>姓名：</strong>{user.name}</p>
              <p><strong>Email：</strong>{user.email}</p>
              <p><strong>電話：</strong>{user.phone || '-'}</p>
              <p><strong>角色：</strong>{getRoleLabel(user.role)}</p>
            </div>
            
            <div>
              <h4 style={{ color: '#6c757d', marginBottom: '1rem' }}>撥款帳戶</h4>
              <p><strong>銀行：</strong>{user.bank_name || '-'} ({user.bank_code || '-'})</p>
              <p><strong>帳號：</strong>{user.account_number || '-'}</p>
              <p><strong>戶名：</strong>{user.account_name || '-'}</p>
            </div>
            
            <div>
              <h4 style={{ color: '#6c757d', marginBottom: '1rem' }}>統計資訊</h4>
              <p><strong>總專案數：</strong>{stats.projectCount || 0}</p>
              <p><strong>總分潤：</strong>NT$ {stats.totalCommission?.toLocaleString() || 0}</p>
              <p><strong>待撥款：</strong>NT$ {stats.pendingCommission?.toLocaleString() || 0}</p>
              <p><strong>已撥款：</strong>NT$ {stats.totalPaid?.toLocaleString() || 0}</p>
            </div>
          </div>
        )}
      </div>

      {/* 下屬管理 (只有主管角色顯示) */}
      {user.role === 'leader' && (
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0 }}>下屬管理</h3>
          
          <div style={{ marginBottom: '2rem' }}>
            <h4>目前下屬</h4>
            {subordinates.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {subordinates.map(sub => (
                  <div key={sub.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px'
                  }}>
                    <span>{sub.name} ({sub.email})</span>
                    <button
                      onClick={() => removeSubordinate(sub.id)}
                      style={{
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#e74c3c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#6c757d' }}>尚無下屬</p>
            )}
          </div>

          <div>
            <h4>可分派人員</h4>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {allUsers
                .filter(u => u.id !== id && u.role === 'sales' && !u.supervisor_id)
                .map(user => (
                <div key={user.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  backgroundColor: '#e8f5e9',
                  borderRadius: '4px'
                }}>
                  <span>{user.name} ({user.email})</span>
                  <button
                    onClick={() => addSubordinate(user.id)}
                    style={{
                      padding: '0.25rem 0.75rem',
                      backgroundColor: '#27ae60',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    分派
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 分潤記錄 */}
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3 style={{ marginTop: 0 }}>分潤記錄</h3>
        
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>專案</th>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>客戶</th>
              <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>專案金額</th>
              <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>分潤%</th>
              <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>分潤金額</th>
              <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>狀態</th>
            </tr>
          </thead>
          <tbody>
            {commissionRecords.map(record => (
              <tr key={record.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                <td style={{ padding: '1rem' }}>{record.project?.project_code}</td>
                <td style={{ padding: '1rem' }}>{record.project?.client_name}</td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>NT$ {record.project?.amount?.toLocaleString()}</td>
                <td style={{ padding: '1rem', textAlign: 'center' }}>{record.percentage}%</td>
                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>NT$ {record.amount?.toLocaleString()}</td>
                <td style={{ padding: '1rem', textAlign: 'center' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '4px',
                    backgroundColor: record.status === 'paid' ? '#27ae60' : '#f39c12',
                    color: 'white',
                    fontSize: '0.875rem'
                  }}>
                    {record.status === 'paid' ? '已撥款' : '待撥款'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {commissionRecords.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
            暫無分潤記錄
          </div>
        )}
      </div>

      {/* 撥款記錄 */}
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3 style={{ marginTop: 0 }}>撥款記錄</h3>
        
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>撥款日期</th>
              <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>撥款金額</th>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>撥款方式</th>
              <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>備註</th>
            </tr>
          </thead>
          <tbody>
            {paymentRecords.map(payment => (
              <tr key={payment.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                <td style={{ padding: '1rem' }}>{payment.payment_date}</td>
                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: '#27ae60' }}>
                  NT$ {payment.amount?.toLocaleString()}
                </td>
                <td style={{ padding: '1rem' }}>{payment.method || '轉帳'}</td>
                <td style={{ padding: '1rem' }}>{payment.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {paymentRecords.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
            暫無撥款記錄
          </div>
        )}
      </div>
  );
}