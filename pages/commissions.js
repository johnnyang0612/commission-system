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
  const [showRules, setShowRules] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');

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

    const { data: installmentData, error: installmentError } = await supabase
      .from('project_installments')
      .select(`
        *,
        project:project_id (
          id,
          client_name,
          project_code,
          project_name,
          amount,
          type,
          assigned_to,
          manager_id,
          use_fixed_commission,
          fixed_commission_percentage
        )
      `)
      .not('actual_commission', 'is', null)
      .gt('actual_commission', 0);

    if (installmentError) {
      console.error('獲取撥款資料失敗:', installmentError);
      return;
    }

    const commissionsByProject = {};

    installmentData?.forEach(installment => {
      const projectId = installment.project_id;
      if (!commissionsByProject[projectId]) {
        const project = installment.project;
        let commissionRate = 0;
        if (project.use_fixed_commission && project.fixed_commission_percentage) {
          commissionRate = project.fixed_commission_percentage;
        } else if (project.type === 'renewal') {
          commissionRate = 15;
        } else {
          commissionRate = 35;
        }

        commissionsByProject[projectId] = {
          id: projectId,
          project_id: projectId,
          user_id: project.assigned_to,
          percentage: commissionRate,
          amount: parseFloat(project.amount || 0) * (commissionRate / 100),
          status: 'pending',
          total_paid_amount: 0,
          payout_count: 0,
          remaining_amount: 0,
          paid_percentage: 0,
          created_at: project.created_at || new Date().toISOString(),
          project: project,
          payouts: []
        };
      }

      commissionsByProject[projectId].total_paid_amount += parseFloat(installment.actual_commission || 0);
      commissionsByProject[projectId].payout_count += 1;
      commissionsByProject[projectId].payouts.push({
        amount: installment.actual_commission,
        date: installment.commission_payment_date,
        installment_number: installment.installment_number
      });
    });

    Object.values(commissionsByProject).forEach(commission => {
      commission.remaining_amount = commission.amount - commission.total_paid_amount;
      commission.paid_percentage = commission.amount > 0 ?
        (commission.total_paid_amount / commission.amount * 100) : 0;
    });

    setCommissions(Object.values(commissionsByProject));
  }

  async function fetchProjects() {
    if (!supabase) return;

    let query = supabase.from('projects').select('*');
    const user = getCurrentUser();
    const role = getCurrentUserRole();

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
    if (!supabase || !projectId) return;

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
      setSelectedProject('');
    }
  }

  async function syncCommissionWithInstallments(projectId) {
    if (!supabase) return;

    const { data: paidInstallments, error: installmentError } = await supabase
      .from('project_installments')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'paid');

    if (installmentError || !paidInstallments || paidInstallments.length === 0) return;

    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const totalPaid = paidInstallments.reduce((sum, installment) => sum + installment.amount, 0);
    const paymentRatio = totalPaid / project.amount;

    if (paymentRatio >= 0.6) {
      const { error: updateError } = await supabase
        .from('commissions')
        .update({ status: 'approved' })
        .eq('project_id', projectId)
        .eq('status', 'pending');

      if (!updateError) {
        fetchCommissions();
      }
    }
  }

  async function handleCommissionPayout(commissionId) {
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

  const getPayoutStatus = (commission) => {
    if (commission.total_paid_amount >= commission.amount) {
      return { label: '已全額撥款', color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: '✅' };
    } else if (commission.total_paid_amount > 0) {
      return { label: '部分撥款', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: '🔄' };
    }
    return { label: '等待撥款', color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: '⏳' };
  };

  const availableProjects = projects.filter(p => !commissions.find(c => c.project_id === p.id));

  const styles = {
    page: { padding: 20, maxWidth: 1200, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
    title: { fontSize: 20, fontWeight: 600, margin: 0 },
    headerBtn: { padding: '10px 16px', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: 8, fontWeight: 500, cursor: 'pointer', fontSize: 14 },
    section: { background: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
    sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    calcRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
    select: { flex: 1, minWidth: 200, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 },
    calcBtn: { padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' },
    rulesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 },
    ruleCard: { padding: 12, borderRadius: 8, fontSize: 13 },
    card: { background: 'white', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
    projectCode: { fontSize: 14, fontWeight: 600, color: '#2563eb', cursor: 'pointer' },
    clientName: { fontSize: 13, color: '#64748b' },
    badge: { padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 },
    stat: { textAlign: 'center', padding: 12, background: '#f8fafc', borderRadius: 8 },
    statLabel: { fontSize: 12, color: '#64748b', marginBottom: 4 },
    statValue: { fontSize: 16, fontWeight: 600 },
    progress: { marginBottom: 12 },
    progressBar: { height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
    progressFill: { height: '100%', borderRadius: 4, transition: 'width 0.3s' },
    progressText: { fontSize: 12, color: '#64748b', textAlign: 'center' },
    cardActions: { display: 'flex', gap: 8 },
    actionBtn: { flex: 1, padding: '10px 12px', border: 'none', borderRadius: 8, fontWeight: 500, cursor: 'pointer', fontSize: 13 },
    empty: { textAlign: 'center', padding: 40, color: '#94a3b8' },
    toggleBtn: { background: 'none', border: 'none', color: '#2563eb', fontSize: 13, cursor: 'pointer' }
  };

  return (
    <div style={styles.page}>
      {/* 頁面標題 */}
      <div style={styles.header}>
        <h1 style={styles.title}>分潤管理</h1>
        <button onClick={batchGenerateLaborReceipts} style={styles.headerBtn}>
          批量產生勞報單
        </button>
      </div>

      {/* 快速計算分潤 */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>快速計算分潤</div>
        <div style={styles.calcRow}>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            style={styles.select}
          >
            <option value="">選擇專案...</option>
            {availableProjects.map(project => (
              <option key={project.id} value={project.id}>
                {project.project_code} - {project.client_name}
              </option>
            ))}
          </select>
          <button onClick={() => calculateCommission(selectedProject)} style={styles.calcBtn}>
            計算分潤
          </button>
        </div>
      </div>

      {/* 分潤計算規則（可收合） */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <span>分潤計算規則</span>
          <button onClick={() => setShowRules(!showRules)} style={styles.toggleBtn}>
            {showRules ? '收合' : '展開'}
          </button>
        </div>
        {showRules && (
          <div style={styles.rulesGrid}>
            <div style={{ ...styles.ruleCard, background: '#ecfdf5' }}>
              <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 8 }}>新簽案件</div>
              <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                0-100K: 35%<br/>
                100-300K: 30%<br/>
                300-600K: 25%<br/>
                600K-1M: 20%<br/>
                1M+: 10%
              </div>
            </div>
            <div style={{ ...styles.ruleCard, background: '#eff6ff' }}>
              <div style={{ fontWeight: 600, color: '#2563eb', marginBottom: 8 }}>續簽案件</div>
              <div style={{ fontSize: 12, color: '#374151' }}>固定 15%<br/>不計入當月累計</div>
            </div>
            <div style={{ ...styles.ruleCard, background: '#f8fafc' }}>
              <div style={{ fontWeight: 600, color: '#64748b', marginBottom: 8 }}>維護費</div>
              <div style={{ fontSize: 12, color: '#374151' }}>不分潤</div>
            </div>
          </div>
        )}
      </div>

      {/* 分潤列表（卡片式） */}
      {commissions.length === 0 ? (
        <div style={{ ...styles.section, ...styles.empty }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>💰</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>尚無分潤資料</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>選擇專案計算分潤開始</div>
        </div>
      ) : (
        commissions.map(commission => {
          const status = getPayoutStatus(commission);
          return (
            <div key={commission.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={styles.projectCode}
                    onClick={() => window.location.href = `/projects/${commission.project_id}`}
                  >
                    {commission.project?.project_code}
                  </div>
                  <div style={styles.clientName}>{commission.project?.client_name}</div>
                </div>
                <span style={{ ...styles.badge, background: status.bg, color: status.color }}>
                  {status.icon} {status.label}
                </span>
              </div>

              <div style={styles.statsGrid}>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>專案金額</div>
                  <div style={styles.statValue}>NT$ {commission.project?.amount?.toLocaleString()}</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>分潤 ({commission.percentage}%)</div>
                  <div style={{ ...styles.statValue, color: '#2563eb' }}>NT$ {commission.amount?.toLocaleString()}</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>已撥款</div>
                  <div style={{ ...styles.statValue, color: '#10b981' }}>NT$ {(commission.total_paid_amount || 0).toLocaleString()}</div>
                </div>
                <div style={styles.stat}>
                  <div style={styles.statLabel}>待撥款</div>
                  <div style={{ ...styles.statValue, color: '#ef4444' }}>NT$ {(commission.remaining_amount || 0).toLocaleString()}</div>
                </div>
              </div>

              <div style={styles.progress}>
                <div style={styles.progressBar}>
                  <div style={{
                    ...styles.progressFill,
                    width: `${Math.min(commission.paid_percentage || 0, 100)}%`,
                    background: commission.paid_percentage >= 100 ? '#10b981' : '#2563eb'
                  }} />
                </div>
                <div style={styles.progressText}>撥款進度 {(commission.paid_percentage || 0).toFixed(1)}%</div>
              </div>

              <div style={styles.cardActions}>
                <button
                  onClick={() => window.location.href = `/projects/${commission.project_id}`}
                  style={{ ...styles.actionBtn, background: '#2563eb', color: 'white' }}
                >
                  查看專案
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
