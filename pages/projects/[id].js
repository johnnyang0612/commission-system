import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import Layout from '../../components/Layout';

export default function ProjectDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [project, setProject] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [showAddInstallment, setShowAddInstallment] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editFormData, setEditFormData] = useState({});
  const [installmentForm, setInstallmentForm] = useState({
    installment_number: '',
    due_date: '',
    amount: '',
    status: 'pending'
  });
  const [maintenanceForm, setMaintenanceForm] = useState({
    warranty_period: '',
    actual_completion_date: '',
    maintenance_start_date: '',
    maintenance_billing_date: '',
    maintenance_fee: ''
  });

  useEffect(() => {
    if (id) {
      fetchProject();
      fetchInstallments();
      fetchCommissions();
    }
  }, [id]);

  async function fetchProject() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        users:assigned_to (name, email)
      `)
      .eq('id', id)
      .single();
    
    if (error) console.error(error);
    else {
      setProject(data);
      setEditFormData(data);
      setMaintenanceForm({
        warranty_period: data.warranty_period || '',
        actual_completion_date: data.actual_completion_date || '',
        maintenance_start_date: data.maintenance_start_date || '',
        maintenance_billing_date: data.maintenance_billing_date || '',
        maintenance_fee: data.maintenance_fee || ''
      });
    }
  }

  async function fetchInstallments() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('project_installments')
      .select('*')
      .eq('project_id', id)
      .order('installment_number');
    
    if (error) console.error(error);
    else setInstallments(data || []);
  }

  async function fetchCommissions() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('commissions')
      .select('*')
      .eq('project_id', id);
    
    if (error) console.error(error);
    else setCommissions(data || []);
  }

  async function handleAddInstallment(e) {
    e.preventDefault();
    if (!supabase) return;
    
    const { error } = await supabase
      .from('project_installments')
      .insert([{
        project_id: id,
        ...installmentForm,
        amount: parseFloat(installmentForm.amount)
      }]);
    
    if (error) {
      console.error(error);
      alert('新增失敗');
    } else {
      alert('新增成功');
      setShowAddInstallment(false);
      setInstallmentForm({
        installment_number: '',
        due_date: '',
        amount: '',
        status: 'pending'
      });
      fetchInstallments();
    }
  }

  async function updateInstallmentStatus(installmentId, status, paymentDate, actualAmount) {
    if (!supabase) return;
    
    const updateData = { status };
    if (status === 'paid') {
      if (paymentDate) updateData.payment_date = paymentDate;
      if (actualAmount) updateData.actual_amount = parseFloat(actualAmount);
    }
    
    const { error } = await supabase
      .from('project_installments')
      .update(updateData)
      .eq('id', installmentId);
    
    if (error) {
      console.error(error);
      alert('更新失敗');
    } else {
      alert('更新成功');
      fetchInstallments();
      
      // 如果是標記為已付款，自動計算分潤
      if (status === 'paid') {
        await calculateCommissionForInstallment(installmentId);
      }
    }
  }

  async function calculateCommissionForInstallment(installmentId) {
    if (!supabase || !project) return;
    
    // 檢查該專案是否已有分潤記錄
    const existingCommission = commissions.find(c => c.project_id === project.id);
    if (existingCommission) return; // 已有分潤，不重複計算
    
    // 計算分潤比例
    let percentage = 0;
    if (project.type === 'new') {
      // 新簽案件階梯式計算（簡化版）
      const projectAmount = project.amount;
      if (projectAmount <= 100000) percentage = 35;
      else if (projectAmount <= 300000) percentage = 30;
      else if (projectAmount <= 600000) percentage = 25;
      else if (projectAmount <= 1000000) percentage = 20;
      else percentage = 10;
    } else if (project.type === 'renewal') {
      percentage = 15;
    }
    
    if (percentage > 0) {
      const commissionAmount = (project.amount * percentage) / 100;
      
      const { error } = await supabase
        .from('commissions')
        .insert([{
          project_id: project.id,
          user_id: project.assigned_to,
          percentage: percentage,
          amount: commissionAmount,
          status: 'pending'
        }]);
      
      if (!error) {
        fetchCommissions();
      }
    }
  }

  async function updateProject(e) {
    e.preventDefault();
    if (!supabase) return;
    
    // 記錄修改歷史
    const changes = [];
    Object.keys(editFormData).forEach(key => {
      if (project[key] !== editFormData[key]) {
        changes.push({
          field: key,
          old_value: project[key],
          new_value: editFormData[key]
        });
      }
    });
    
    if (changes.length === 0) {
      alert('沒有變更');
      return;
    }
    
    const { error } = await supabase
      .from('projects')
      .update(editFormData)
      .eq('id', id);
    
    if (error) {
      console.error(error);
      alert('更新失敗');
    } else {
      // 記錄修改歷史
      await supabase
        .from('project_change_logs')
        .insert(changes.map(change => ({
          project_id: id,
          field_name: change.field,
          old_value: String(change.old_value || ''),
          new_value: String(change.new_value || ''),
          changed_by: 'current_user', // 實際應該是登入用戶
          change_date: new Date().toISOString()
        })));
      
      alert('更新成功');
      setShowEditForm(false);
      fetchProject();
    }
  }

  async function updateMaintenanceInfo(e) {
    e.preventDefault();
    if (!supabase) return;
    
    const { error } = await supabase
      .from('projects')
      .update({
        ...maintenanceForm,
        maintenance_fee: maintenanceForm.maintenance_fee ? parseFloat(maintenanceForm.maintenance_fee) : null
      })
      .eq('id', id);
    
    if (error) {
      console.error(error);
      alert('更新失敗');
    } else {
      alert('維護資訊更新成功');
      fetchProject();
    }
  }

  if (!project) {
    return (
      <Layout>
        <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>
      </Layout>
    );
  }

  const totalPaid = installments
    .filter(i => i.status === 'paid')
    .reduce((sum, i) => sum + i.amount, 0);
  
  const totalAmount = project.amount * 1.05;
  const paymentProgress = (totalPaid / totalAmount * 100).toFixed(1);

  return (
    <Layout>
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ← 返回專案列表
        </button>
      </div>

      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginTop: 0 }}>專案詳情：{project.project_code}</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
          <div>
            <h4 style={{ color: '#6c757d', marginBottom: '1rem' }}>客戶資訊</h4>
            <p><strong>客戶名稱：</strong>{project.client_name}</p>
            <p><strong>專案名稱：</strong>{project.project_name}</p>
            <p><strong>聯絡人：</strong>{project.contact_person}</p>
            <p><strong>電話：</strong>{project.contact_phone}</p>
            <p><strong>Email：</strong>{project.contact_email}</p>
            <p><strong>統編/身分證：</strong>{project.tax_id}</p>
          </div>
          
          <div>
            <h4 style={{ color: '#6c757d', marginBottom: '1rem' }}>專案資訊</h4>
            <p><strong>負責業務：</strong>{project.users?.name}</p>
            <p><strong>簽約日期：</strong>{project.sign_date}</p>
            <p><strong>預計完成：</strong>{project.expected_completion_date}</p>
            <p><strong>未稅金額：</strong>NT$ {project.amount?.toLocaleString()}</p>
            <p><strong>含稅金額：</strong>NT$ {totalAmount?.toLocaleString()}</p>
            <p><strong>付款模板：</strong>{project.payment_template}</p>
          </div>
          
          <div>
            <h4 style={{ color: '#6c757d', marginBottom: '1rem' }}>收款進度</h4>
            <div style={{
              backgroundColor: '#e9ecef',
              borderRadius: '8px',
              overflow: 'hidden',
              height: '30px',
              marginBottom: '1rem'
            }}>
              <div style={{
                backgroundColor: paymentProgress >= 100 ? '#27ae60' : '#3498db',
                width: `${Math.min(paymentProgress, 100)}%`,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}>
                {paymentProgress}%
              </div>
            </div>
            <p><strong>已收金額：</strong>NT$ {totalPaid.toLocaleString()}</p>
            <p><strong>待收金額：</strong>NT$ {(totalAmount - totalPaid).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>付款期數管理</h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => setShowEditForm(!showEditForm)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#f39c12',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {showEditForm ? '取消編輯' : '編輯專案'}
            </button>
            <button
              onClick={() => setShowAddInstallment(!showAddInstallment)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {showAddInstallment ? '取消' : '新增期數'}
            </button>
          </div>
        </div>

{showEditForm && (
          <form onSubmit={updateProject} style={{
            backgroundColor: '#fff3cd',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            border: '1px solid #ffeaa7'
          }}>
            <h4>編輯專案資訊</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <input
                type="text"
                placeholder="客戶名稱"
                value={editFormData.client_name || ''}
                onChange={(e) => setEditFormData({...editFormData, client_name: e.target.value})}
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <input
                type="text"
                placeholder="專案名稱"
                value={editFormData.project_name || ''}
                onChange={(e) => setEditFormData({...editFormData, project_name: e.target.value})}
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <input
                type="text"
                placeholder="聯絡人"
                value={editFormData.contact_person || ''}
                onChange={(e) => setEditFormData({...editFormData, contact_person: e.target.value})}
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <input
                type="tel"
                placeholder="電話"
                value={editFormData.contact_phone || ''}
                onChange={(e) => setEditFormData({...editFormData, contact_phone: e.target.value})}
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <input
                type="email"
                placeholder="Email"
                value={editFormData.contact_email || ''}
                onChange={(e) => setEditFormData({...editFormData, contact_email: e.target.value})}
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <input
                type="date"
                placeholder="預計完成日期"
                value={editFormData.expected_completion_date || ''}
                onChange={(e) => setEditFormData({...editFormData, expected_completion_date: e.target.value})}
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
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
                cursor: 'pointer'
              }}
            >
              確認更新
            </button>
          </form>
        )}

        {showAddInstallment && (
          <form onSubmit={handleAddInstallment} style={{
            backgroundColor: '#f8f9fa',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
              <input
                type="number"
                placeholder="期數"
                value={installmentForm.installment_number}
                onChange={(e) => setInstallmentForm({...installmentForm, installment_number: e.target.value})}
                required
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <input
                type="date"
                placeholder="預定付款日"
                value={installmentForm.due_date}
                onChange={(e) => setInstallmentForm({...installmentForm, due_date: e.target.value})}
                required
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <input
                type="number"
                placeholder="金額"
                value={installmentForm.amount}
                onChange={(e) => setInstallmentForm({...installmentForm, amount: e.target.value})}
                required
                style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }}
              />
              <button
                type="submit"
                style={{
                  padding: '0.5rem',
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                確認新增
              </button>
            </div>
          </form>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem' }}>期數</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem' }}>預定日期</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem' }}>應收金額</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem' }}>實收金額</th>
              <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem' }}>狀態</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem' }}>實際付款日</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem' }}>應撥分潤</th>
              <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #dee2e6', fontSize: '0.9rem' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {installments.map(installment => {
              // 計算該期應撥分潤金額（簡化計算）
              const commission = commissions.length > 0 ? commissions[0] : null;
              const commissionPerInstallment = commission ? (commission.amount / installments.length) : 0;
              
              return (
                <tr key={installment.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>第 {installment.installment_number} 期</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{installment.due_date}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.9rem' }}>NT$ {installment.amount?.toLocaleString()}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.9rem', fontWeight: installment.actual_amount ? 'bold' : 'normal' }}>
                    {installment.actual_amount ? `NT$ ${installment.actual_amount.toLocaleString()}` : '-'}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: installment.status === 'paid' ? '#27ae60' : '#f39c12',
                      color: 'white',
                      fontSize: '0.75rem'
                    }}>
                      {installment.status === 'paid' ? '已付款' : '待付款'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{installment.payment_date || '-'}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.9rem', color: '#27ae60' }}>
                    {installment.status === 'paid' && commissionPerInstallment > 0 ? 
                      `NT$ ${Math.round(commissionPerInstallment).toLocaleString()}` : '-'}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                    {installment.status !== 'paid' && (
                      <button
                        onClick={() => {
                          const paymentDate = prompt('請輸入付款日期 (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
                          const actualAmount = prompt('請輸入實際收款金額:', installment.amount);
                          if (paymentDate && actualAmount) {
                            updateInstallmentStatus(installment.id, 'paid', paymentDate, actualAmount);
                          }
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#27ae60',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        標記已付
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {/* 分潤總覽 */}
        {commissions.length > 0 && (
          <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#e8f5e9', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 1rem 0', color: '#27ae60' }}>分潤資訊</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <strong>分潤比例：</strong>{commissions[0].percentage}%
              </div>
              <div>
                <strong>分潤總額：</strong>NT$ {commissions[0].amount.toLocaleString()}
              </div>
              <div>
                <strong>撥款狀態：</strong>
                <span style={{
                  marginLeft: '0.5rem',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: commissions[0].status === 'paid' ? '#27ae60' : '#f39c12',
                  color: 'white',
                  fontSize: '0.875rem'
                }}>
                  {commissions[0].status === 'paid' ? '已撥款' : '待撥款'}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {installments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>
            尚未設定付款期數
          </div>
        )}
      </div>

      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1.5rem' }}>保固與維護資訊</h3>
        
        <form onSubmit={updateMaintenanceInfo}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                保固期間（月）
              </label>
              <input
                type="number"
                value={maintenanceForm.warranty_period}
                onChange={(e) => setMaintenanceForm({...maintenanceForm, warranty_period: e.target.value})}
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
                實際結案日期
              </label>
              <input
                type="date"
                value={maintenanceForm.actual_completion_date}
                onChange={(e) => setMaintenanceForm({...maintenanceForm, actual_completion_date: e.target.value})}
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
                維護起算日
              </label>
              <input
                type="date"
                value={maintenanceForm.maintenance_start_date}
                onChange={(e) => setMaintenanceForm({...maintenanceForm, maintenance_start_date: e.target.value})}
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
                維護費起收日
              </label>
              <input
                type="date"
                value={maintenanceForm.maintenance_billing_date}
                onChange={(e) => setMaintenanceForm({...maintenanceForm, maintenance_billing_date: e.target.value})}
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
                維護費金額（月）
              </label>
              <input
                type="number"
                value={maintenanceForm.maintenance_fee}
                onChange={(e) => setMaintenanceForm({...maintenanceForm, maintenance_fee: e.target.value})}
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
              marginTop: '1.5rem',
              padding: '0.75rem 2rem',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            更新維護資訊
          </button>
        </form>
      </div>
    </Layout>
  );
}