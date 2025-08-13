import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { canViewFinancialData, getCurrentUser, getCurrentUserRole } from '../utils/permissions';
import { generateLaborReceipt, generatePendingLaborReceipts } from '../utils/laborReceiptGenerator';
import { calculateAvailableCommissionPayout, executeCommissionPayout } from '../utils/commissionPayoutManager';

export default function Commissions() {
  const [commissions, setCommissions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const user = getCurrentUser();
    const role = getCurrentUserRole();
    setCurrentUser(user);
    setUserRole(role);
    
    fetchCommissions();
    fetchProjects();
    calculateMonthlyStats();
  }, []);

  async function fetchCommissions() {
    if (!supabase) return;
    
    let query = supabase
      .from('commission_summary')
      .select(`
        *,
        project:project_id (
          client_name,
          project_code,
          project_name,
          amount,
          type,
          assigned_to,
          manager_id
        ),
        user:user_id (
          name,
          email
        )
      `);
    
    // Apply role-based filtering
    const user = getCurrentUser();
    const role = getCurrentUserRole();
    
    // 暫時移除角色過濾，確保分潤資料可以正常載入
    if (role === 'sales') {
      // 當有真實用戶系統時，可以啟用這個過濾
      // query = query.eq('user_id', user.id);
    } else if (role === 'leader') {
      // 當有真實用戶階層資料時，可以啟用這個過濾
      // query = query.or(`user_id.eq.${user.id},project.manager_id.eq.${user.id}`);
    }
    // Admin and Finance can see all commissions
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) console.error(error);
    else setCommissions(data || []);
  }

  async function fetchProjects() {
    if (!supabase) return;
    
    let query = supabase.from('projects').select('*');
    
    // Apply role-based filtering for project selection
    const user = getCurrentUser();
    const role = getCurrentUserRole();
    
    // 暫時移除角色過濾，確保專案資料可以正常載入
    if (role === 'sales') {
      // query = query.eq('assigned_to', user.id);
    } else if (role === 'leader') {
      // query = query.or(`assigned_to.eq.${user.id},manager_id.eq.${user.id}`);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) console.error(error);
    else setProjects(data || []);
  }

  async function calculateMonthlyStats() {
    if (!supabase) return;
    
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const { data, error } = await supabase
      .from('commissions')
      .select('user_id, amount')
      .gte('created_at', `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`)
      .lt('created_at', `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-01`);
    
    if (!error && data) {
      const stats = {};
      data.forEach(commission => {
        if (!stats[commission.user_id]) {
          stats[commission.user_id] = 0;
        }
        stats[commission.user_id] += commission.amount;
      });
      setMonthlyStats(stats);
    }
  }

  async function calculateCommission(projectId) {
    if (!supabase) return;
    
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const userId = project.assigned_to;
    const userMonthlyTotal = monthlyStats[userId] || 0;
    
    let percentage = 0;
    
    if (project.type === 'new') {
      if (userMonthlyTotal < 100000) percentage = 35;
      else if (userMonthlyTotal < 300000) percentage = 30;
      else if (userMonthlyTotal < 600000) percentage = 25;
      else if (userMonthlyTotal < 1000000) percentage = 20;
      else percentage = 10;
    } else if (project.type === 'renewal') {
      percentage = 15;
    } else if (project.type === 'maintenance') {
      percentage = 0;
    }
    
    const commissionAmount = (project.amount * percentage) / 100;
    
    const { error } = await supabase
      .from('commissions')
      .insert([{
        project_id: projectId,
        user_id: userId,
        percentage: percentage,
        amount: commissionAmount,
        status: 'pending'
      }]);
    
    if (error) {
      console.error(error);
      alert('計算失敗');
    } else {
      alert(`分潤計算成功！\n分潤比例: ${percentage}%\n分潤金額: NT$ ${commissionAmount.toLocaleString()}`);
      fetchCommissions();
      calculateMonthlyStats();
      await syncCommissionWithInstallments(projectId);
    }
  }
  
  async function syncCommissionWithInstallments(projectId) {
    if (!supabase) return;
    
    // Check if any installments for this project have been paid
    const { data: paidInstallments, error: installmentError } = await supabase
      .from('project_installments')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'paid');
    
    if (installmentError || !paidInstallments || paidInstallments.length === 0) return;
    
    // Get the project to check payment ratio
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    // Calculate total paid amount from installments
    const totalPaid = paidInstallments.reduce((sum, installment) => sum + installment.amount, 0);
    const paymentRatio = totalPaid / project.amount;
    
    // If 60% or more has been paid, auto-approve commission
    if (paymentRatio >= 0.6) {
      const { error: updateError } = await supabase
        .from('commissions')
        .update({ status: 'approved' })
        .eq('project_id', projectId)
        .eq('status', 'pending');
      
      if (!updateError) {
        console.log('Commission auto-approved based on installment payments');
        fetchCommissions(); // Refresh the commission list
      }
    }
  }

  const getStatusLabel = (status) => {
    const labels = {
      'pending': '待撥款',
      'approved': '已核准',
      'paid': '已撥款',
      'fully_paid': '已全額撥款',
      'cancelled': '已取消'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': '#f39c12',
      'approved': '#3498db',
      'paid': '#27ae60',
      'fully_paid': '#2ecc71',
      'cancelled': '#e74c3c'
    };
    return colors[status] || '#95a5a6';
  };

  async function handleCommissionPayout(commissionId) {
    // 1. 先計算可撥款金額
    const commission = commissions.find(c => c.id === commissionId);
    if (!commission) {
      alert('找不到分潤記錄');
      return;
    }

    const availableInfo = await calculateAvailableCommissionPayout(commission.project_id);
    if (!availableInfo.success) {
      alert(`計算可撥款金額失敗: ${availableInfo.error}`);
      return;
    }

    const commissionInfo = availableInfo.commissions.find(c => c.commission.id === commissionId);
    if (!commissionInfo || !commissionInfo.canPayout) {
      alert('目前沒有可撥款的金額');
      return;
    }

    // 2. 讓使用者輸入撥款金額
    const maxAmount = commissionInfo.availableCommissionAmount;
    const inputAmount = prompt(
      `可撥款金額：NT$ ${maxAmount.toLocaleString()}\n\n請輸入要撥款的金額：`, 
      maxAmount.toString()
    );

    if (!inputAmount || isNaN(inputAmount) || parseFloat(inputAmount) <= 0) {
      return;
    }

    const payoutAmount = parseFloat(inputAmount);
    if (payoutAmount > maxAmount) {
      alert(`撥款金額不能超過可撥款額度 NT$ ${maxAmount.toLocaleString()}`);
      return;
    }

    const confirmed = confirm(`確定要撥款 NT$ ${payoutAmount.toLocaleString()} 嗎？\n\n撥款後將自動產生勞務報酬單。`);
    if (!confirmed) return;

    try {
      // 3. 執行撥款
      const result = await executeCommissionPayout(commissionId, payoutAmount, {
        payoutDate: new Date().toISOString().split('T')[0],
        notes: '手動撥款'
      });

      if (result.success) {
        let message = `撥款成功！金額：NT$ ${payoutAmount.toLocaleString()}`;
        
        if (result.laborReceiptResult?.success) {
          message += `\n\n已自動產生勞務報酬單：${result.laborReceiptResult.receiptNumber}`;
          message += `\n實發金額：NT$ ${result.laborReceiptResult.netAmount.toLocaleString()}`;
        }
        
        alert(message);
        fetchCommissions();
      } else {
        alert(`撥款失敗: ${result.error}`);
      }

    } catch (error) {
      console.error('撥款失敗:', error);
      alert(`撥款失敗: ${error.message}`);
    }
  }

  async function batchGenerateLaborReceipts() {
    const confirmed = confirm('確定要批量產生所有未產生的勞務報酬單嗎？');
    if (!confirmed) return;

    try {
      const result = await generatePendingLaborReceipts();
      
      if (result.success) {
        alert(`批量產生完成！\n\n處理數量：${result.totalProcessed}\n成功：${result.successCount}\n失敗：${result.failCount}`);
        fetchCommissions();
      } else {
        alert(`批量產生失敗：${result.error}`);
      }
    } catch (error) {
      console.error('批量產生勞務報酬單失敗:', error);
      alert(`操作失敗: ${error.message}`);
    }
  }

  return (
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0 }}>分潤管理</h2>
          <button
            onClick={batchGenerateLaborReceipts}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#9b59b6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            批量產生勞務報酬單
          </button>
        </div>

        <div style={{ backgroundColor: '#f8f9fa', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem' }}>
          <h3>快速計算分潤</h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <select
              id="projectSelect"
              style={{
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                flex: 1
              }}
            >
              <option value="">選擇專案</option>
              {projects.filter(p => !commissions.find(c => c.project_id === p.id)).map(project => (
                <option key={project.id} value={project.id}>
                  {project.project_code} - {project.client_name} (NT$ {project.amount?.toLocaleString()})
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const select = document.getElementById('projectSelect');
                if (select.value) {
                  calculateCommission(select.value);
                }
              }}
              style={{
                padding: '0.5rem 1.5rem',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              計算分潤
            </button>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h3>分潤計算規則</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div style={{ backgroundColor: '#e8f5e9', padding: '1rem', borderRadius: '8px' }}>
              <h4 style={{ color: '#27ae60', margin: '0 0 0.5rem 0' }}>新簽案件</h4>
              <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                <li>0 - 100K: 35%</li>
                <li>100K - 300K: 30%</li>
                <li>300K - 600K: 25%</li>
                <li>600K - 1M: 20%</li>
                <li>1M+: 10%</li>
              </ul>
            </div>
            <div style={{ backgroundColor: '#e3f2fd', padding: '1rem', borderRadius: '8px' }}>
              <h4 style={{ color: '#3498db', margin: '0 0 0.5rem 0' }}>續簽案件</h4>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>固定 15%<br/>不計入當月累計</p>
            </div>
            <div style={{ backgroundColor: '#f5f5f5', padding: '1rem', borderRadius: '8px' }}>
              <h4 style={{ color: '#95a5a6', margin: '0 0 0.5rem 0' }}>維護費案件</h4>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>不分潤</p>
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>專案編號</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>客戶名稱</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>業務員</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>專案金額</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>分潤%</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>總分潤</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>已撥款</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>待撥款</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>撥款進度</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>建立時間</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map(commission => (
                <tr key={commission.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '1rem' }}>
                    <a 
                      href={`/projects/${commission.project_id}`}
                      style={{ 
                        color: '#3498db', 
                        textDecoration: 'none',
                        fontWeight: 'bold' 
                      }}
                      onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                      onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                    >
                      {commission.project?.project_code}
                    </a>
                  </td>
                  <td style={{ padding: '1rem' }}>{commission.project?.client_name}</td>
                  <td style={{ padding: '1rem' }}>{commission.user?.name}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    NT$ {commission.project?.amount?.toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {commission.percentage}%
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>
                    NT$ {commission.amount?.toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', color: '#27ae60', fontWeight: 'bold' }}>
                    NT$ {(commission.total_paid_amount || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right', color: '#e74c3c', fontWeight: 'bold' }}>
                    NT$ {(commission.remaining_amount || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                      <div style={{
                        width: '60px',
                        height: '8px',
                        backgroundColor: '#e9ecef',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${Math.min(commission.paid_percentage || 0, 100)}%`,
                          height: '100%',
                          backgroundColor: ((commission.total_paid_amount || 0) >= (commission.amount || 0)) ? '#27ae60' : '#3498db',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                        {(commission.paid_percentage || 0).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {new Date(commission.created_at).toLocaleDateString('zh-TW')}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {(commission.remaining_amount > 0) ? (
                      <button
                        onClick={() => handleCommissionPayout(commission.id)}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#27ae60',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        💰 撥款
                      </button>
                    ) : commission.total_paid_amount >= commission.amount ? (
                      <span style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#f8f9fa',
                        color: '#27ae60',
                        border: '1px solid #27ae60',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold'
                      }}>
                        ✅ 已全額撥款
                      </span>
                    ) : (
                      <span style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#f8f9fa',
                        color: '#6c757d',
                        border: '1px solid #dee2e6',
                        borderRadius: '4px',
                        fontSize: '0.85rem'
                      }}>
                        {getStatusLabel(commission.status)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {commissions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
              暫無分潤資料
            </div>
          )}
        </div>
      </div>
  );
}