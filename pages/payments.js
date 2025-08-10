import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import Layout from '../components/Layout';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    project_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    method: 'transfer'
  });

  useEffect(() => {
    fetchPayments();
    fetchProjects();
  }, []);

  async function fetchPayments() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        project:project_id (
          client_name,
          project_code,
          amount,
          payment_template
        )
      `)
      .order('payment_date', { ascending: false });
    
    if (error) console.error(error);
    else setPayments(data || []);
  }

  async function fetchProjects() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) console.error(error);
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
      
      await checkAndTriggerCommissionPayout(formData.project_id);
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
    const projectPayments = payments.filter(p => p.project_id === project.id);
    const totalPaid = projectPayments.reduce((sum, p) => sum + p.amount, 0);
    const percentage = project.amount ? (totalPaid / project.amount * 100).toFixed(1) : 0;
    return { totalPaid, percentage };
  };

  return (
    <Layout>
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
                  <td style={{ padding: '1rem' }}>{payment.project?.project_code}</td>
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
    </Layout>
  );
}