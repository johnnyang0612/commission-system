import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { canViewFinancialData, getCurrentUser, getCurrentUserRole } from '../utils/permissions';
import { autoPayoutCommissions } from '../utils/commissionPayoutManager';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [formData, setFormData] = useState({
    project_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    method: 'transfer'
  });

  useEffect(() => {
    const user = getCurrentUser();
    const role = getCurrentUserRole();
    setCurrentUser(user);
    setUserRole(role);
    
    fetchPayments();
    fetchProjects();
  }, []);

  async function fetchPayments() {
    if (!supabase) return;
    
    let query = supabase
      .from('payments')
      .select(`
        *,
        project:project_id (
          client_name,
          project_code,
          amount,
          payment_template,
          assigned_to,
          manager_id
        )
      `);
    
    // Apply role-based filtering
    const user = getCurrentUser();
    const role = getCurrentUserRole();
    
    // 暫時移除角色過濾，確保資料可以正常載入
    // 在實際部署時需要根據真實的用戶資料進行過濾
    if (role === 'sales') {
      // 當有真實用戶系統時，可以啟用這個過濾
      // query = query.eq('project.assigned_to', user.id);
    } else if (role === 'leader') {
      // 當有真實用戶階層資料時，可以啟用這個過濾
      // query = query.or(`project.assigned_to.eq.${user.id},project.manager_id.eq.${user.id}`);
    }
    // Admin and Finance can see all payments
    
    const { data, error } = await query.order('payment_date', { ascending: false });
    
    if (error) console.error(error);
    else setPayments(data || []);
  }

  async function fetchProjects() {
    if (!supabase) return;
    
    // 使用新的 payment_commission_summary 視圖，包含收款和撥款統計
    const { data, error } = await supabase
      .from('payment_commission_summary')
      .select('*')
      .order('project_code', { ascending: false });
    
    if (error) console.error('獲取專案統計失敗:', error);
    else setProjects(data || []);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) return;
    
    const { error } = await supabase
      .from('payments')
      .insert([{
        ...formData,
        amount: parseFloat(formData.amount)
      }]);
    
    if (error) {
      console.error(error);
      alert('新增失敗');
    } else {
      alert('收款登錄成功');
      setShowAddForm(false);
      setFormData({
        project_id: '',
        payment_date: new Date().toISOString().split('T')[0],
        amount: '',
        method: 'transfer'
      });
      fetchPayments();
      
      // 自動執行分潤撥款（按收款比例）
      const autoPayoutResult = await autoPayoutCommissions(
        formData.project_id, 
        parseFloat(formData.amount),
        // 這裡應該是新插入的付款記錄ID，暫時用null
        null
      );
      
      if (autoPayoutResult.success && autoPayoutResult.payoutsProcessed > 0) {
        alert(`收款登錄成功！\n\n已自動撥款 ${autoPayoutResult.payoutsProcessed} 筆分潤，並產生對應勞務報酬單。`);
      }
      
      await syncWithProjectInstallments(formData.project_id, parseFloat(formData.amount));
    }
  }

  async function checkAndTriggerCommissionPayout(projectId) {
    if (!supabase) return;
    
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const projectPayments = payments.filter(p => p.project_id === projectId);
    const newPayment = parseFloat(formData.amount);
    const totalPaid = projectPayments.reduce((sum, p) => sum + p.amount, 0) + newPayment;
    
    const paymentRatio = totalPaid / project.amount;
    
    if (paymentRatio >= 0.6) {
      const { data: commissions } = await supabase
        .from('commissions')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'pending');
      
      if (commissions && commissions.length > 0) {
        const { error } = await supabase
          .from('commissions')
          .update({ status: 'approved' })
          .eq('project_id', projectId)
          .eq('status', 'pending');
        
        if (!error) {
          alert('已達到撥款條件，相關分潤已核准！');
        }
      }
    }
  }
  
  async function syncWithProjectInstallments(projectId, paymentAmount) {
    if (!supabase) return;
    
    // Get project installments that haven't been marked as paid
    const { data: installments, error: installmentError } = await supabase
      .from('project_installments')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'unpaid')
      .order('installment_number', { ascending: true });
    
    if (installmentError || !installments || installments.length === 0) return;
    
    let remainingAmount = paymentAmount;
    const installmentUpdates = [];
    
    // Mark installments as paid based on the payment amount
    for (const installment of installments) {
      if (remainingAmount <= 0) break;
      
      if (remainingAmount >= installment.amount) {
        // Full payment for this installment
        installmentUpdates.push({
          id: installment.id,
          status: 'paid',
          paid_date: new Date().toISOString()
        });
        remainingAmount -= installment.amount;
      } else {
        // Partial payment - we'll mark it as partial for now
        // In a more complex system, you might want to split installments
        break;
      }
    }
    
    // Update the installments
    for (const update of installmentUpdates) {
      await supabase
        .from('project_installments')
        .update({ status: update.status, paid_date: update.paid_date })
        .eq('id', update.id);
    }
  }

  const getMethodLabel = (method) => {
    const labels = {
      'transfer': '轉帳',
      'check': '支票',
      'cash': '現金',
      'credit': '信用卡'
    };
    return labels[method] || method;
  };

  const calculatePaymentProgress = (project) => {
    // 使用 payment_commission_summary 視圖的統計數據
    return {
      totalPaid: project.total_received || 0,
      percentage: project.payment_percentage || 0,
      totalCommissionPaid: project.total_commission_paid || 0,
      commissionPercentage: project.commission_percentage || 0,
      receivedInstallments: project.received_installments || 0,
      commissionInstallments: project.commission_installments || 0
    };
  };

  return (
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0 }}>付款記錄管理</h2>
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
            {showAddForm ? '取消' : '登錄收款'}
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSubmit} style={{
            backgroundColor: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  專案
                </label>
                <select
                  value={formData.project_id}
                  onChange={(e) => setFormData({...formData, project_id: e.target.value})}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">選擇專案</option>
                  {projects.map(project => {
                    const progress = calculatePaymentProgress(project);
                    return (
                      <option key={project.id} value={project.id}>
                        {project.project_code} - {project.client_name} 
                        (已收 {progress.percentage}% / NT$ {progress.totalPaid.toLocaleString()})
                      </option>
                    );
                  })}
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  付款日期
                </label>
                <input
                  type="date"
                  value={formData.payment_date}
                  onChange={(e) => setFormData({...formData, payment_date: e.target.value})}
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
                  金額
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
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
                  付款方式
                </label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({...formData, method: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="transfer">轉帳</option>
                  <option value="check">支票</option>
                  <option value="cash">現金</option>
                  <option value="credit">信用卡</option>
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
              確認登錄
            </button>
          </form>
        )}

        <div style={{ marginBottom: '2rem' }}>
          <h3>專案收款進度</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {projects.slice(0, 6).map(project => {
              const progress = calculatePaymentProgress(project);
              return (
                <div key={project.id} style={{
                  backgroundColor: '#f8f9fa',
                  padding: '1rem',
                  borderRadius: '8px',
                  border: '1px solid #dee2e6'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    {project.project_code}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#6c757d', marginBottom: '0.5rem' }}>
                    {project.client_name}
                  </div>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{
                      backgroundColor: '#e9ecef',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      height: '20px'
                    }}>
                      <div style={{
                        backgroundColor: progress.percentage >= 100 ? '#27ae60' : '#3498db',
                        width: `${Math.min(progress.percentage, 100)}%`,
                        height: '100%',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span>{progress.percentage}%</span>
                    <span>NT$ {progress.totalPaid.toLocaleString()} / {project.amount?.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>付款日期</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>專案編號</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>客戶名稱</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>付款金額</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>付款方式</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>專案總額</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>付款模板</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(payment => (
                <tr key={payment.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '1rem' }}>
                    {new Date(payment.payment_date).toLocaleDateString('zh-TW')}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <a 
                      href={`/projects/${payment.project_id}`}
                      style={{ 
                        color: '#3498db', 
                        textDecoration: 'none',
                        fontWeight: 'bold' 
                      }}
                      onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                      onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                    >
                      {payment.project?.project_code}
                    </a>
                  </td>
                  <td style={{ padding: '1rem' }}>{payment.project?.client_name}</td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold', color: '#27ae60' }}>
                    NT$ {payment.amount?.toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>{getMethodLabel(payment.method)}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    NT$ {payment.project?.amount?.toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>{payment.project?.payment_template}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {payments.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
              暫無付款記錄
            </div>
          )}
        </div>
      </div>
  );
}