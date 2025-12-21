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

    const { data: installmentData, error: installmentError } = await supabase
      .from('project_installments')
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
      `)
      .eq('status', 'paid')
      .not('actual_amount', 'is', null)
      .gt('actual_amount', 0)
      .order('payment_date', { ascending: false });

    if (installmentError) {
      console.error('獲取付款記錄失敗:', installmentError);
      return;
    }

    const paymentRecords = installmentData?.map(installment => ({
      id: installment.id,
      project_id: installment.project_id,
      payment_date: installment.payment_date,
      amount: installment.actual_amount || installment.amount,
      method: 'transfer',
      description: `第 ${installment.installment_number} 期付款`,
      project: installment.project
    })) || [];

    setPayments(paymentRecords);
  }

  async function fetchProjects() {
    if (!supabase) return;

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

      const autoPayoutResult = await autoPayoutCommissions(
        formData.project_id,
        parseFloat(formData.amount),
        null
      );

      if (autoPayoutResult.success && autoPayoutResult.payoutsProcessed > 0) {
        alert(`收款登錄成功！\n\n已自動撥款 ${autoPayoutResult.payoutsProcessed} 筆分潤，並產生對應勞務報酬單。`);
      }

      await syncWithProjectInstallments(formData.project_id, parseFloat(formData.amount));
    }
  }

  async function syncWithProjectInstallments(projectId, paymentAmount) {
    if (!supabase) return;

    const { data: installments, error: installmentError } = await supabase
      .from('project_installments')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'unpaid')
      .order('installment_number', { ascending: true });

    if (installmentError || !installments || installments.length === 0) return;

    let remainingAmount = paymentAmount;
    const installmentUpdates = [];

    for (const installment of installments) {
      if (remainingAmount <= 0) break;

      if (remainingAmount >= installment.amount) {
        installmentUpdates.push({
          id: installment.id,
          status: 'paid',
          paid_date: new Date().toISOString()
        });
        remainingAmount -= installment.amount;
      } else {
        break;
      }
    }

    for (const update of installmentUpdates) {
      await supabase
        .from('project_installments')
        .update({ status: update.status, paid_date: update.paid_date })
        .eq('id', update.id);
    }
  }

  const getMethodLabel = (method) => {
    const labels = { 'transfer': '轉帳', 'check': '支票', 'cash': '現金', 'credit': '信用卡' };
    return labels[method] || method;
  };

  const calculatePaymentProgress = (project) => ({
    totalPaid: project.total_received || 0,
    percentage: project.payment_percentage || 0,
    totalCommissionPaid: project.total_commission_paid || 0,
    commissionPercentage: project.commission_percentage || 0,
    receivedInstallments: project.received_installments || 0,
    commissionInstallments: project.commission_installments || 0
  });

  const styles = {
    page: { padding: 20, maxWidth: 1200, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
    title: { fontSize: 20, fontWeight: 600, margin: 0 },
    headerBtn: { padding: '10px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, fontWeight: 500, cursor: 'pointer', fontSize: 14 },
    section: { background: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
    sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 12 },
    form: { background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16 },
    formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
    formGroup: { marginBottom: 12 },
    label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 },
    input: { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' },
    submitBtn: { marginTop: 8, padding: '12px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: 8, fontWeight: 500, cursor: 'pointer', fontSize: 14 },
    progressGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 16 },
    progressCard: { background: 'white', borderRadius: 12, padding: 14, border: '1px solid #f1f5f9' },
    progressHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    progressCode: { fontSize: 14, fontWeight: 600, color: '#1e293b' },
    progressClient: { fontSize: 13, color: '#64748b' },
    progressPercent: { fontSize: 14, fontWeight: 600, color: '#2563eb' },
    progressBar: { height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
    progressFill: { height: '100%', borderRadius: 3, transition: 'width 0.3s' },
    progressAmount: { fontSize: 12, color: '#64748b', textAlign: 'right' },
    card: { background: 'white', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #f1f5f9' },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
    paymentDate: { fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: 4 },
    projectCode: { fontSize: 14, fontWeight: 600, color: '#2563eb', cursor: 'pointer' },
    clientName: { fontSize: 13, color: '#64748b', marginTop: 2 },
    cardRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 },
    cardLabel: { color: '#64748b' },
    cardValue: { fontWeight: 500, color: '#1e293b' },
    amount: { fontSize: 18, fontWeight: 700, color: '#10b981' },
    badge: { display: 'inline-flex', padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: 'rgba(37,99,235,0.1)', color: '#2563eb' },
    empty: { textAlign: 'center', padding: 40, color: '#94a3b8' }
  };

  return (
    <div style={styles.page}>
      {/* 頁面標題 */}
      <div style={styles.header}>
        <h1 style={styles.title}>付款記錄</h1>
        <button onClick={() => setShowAddForm(!showAddForm)} style={styles.headerBtn}>
          {showAddForm ? '取消' : '登錄收款'}
        </button>
      </div>

      {/* 新增收款表單 */}
      {showAddForm && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGrid}>
            <div style={styles.formGroup}>
              <label style={styles.label}>專案</label>
              <select
                value={formData.project_id}
                onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                required
                style={styles.input}
              >
                <option value="">選擇專案...</option>
                {projects.map(project => {
                  const progress = calculatePaymentProgress(project);
                  return (
                    <option key={project.id} value={project.id}>
                      {project.project_code} - {project.client_name} (已收 {progress.percentage}%)
                    </option>
                  );
                })}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>付款日期</label>
              <input
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                required
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>金額</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                placeholder="請輸入金額"
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>付款方式</label>
              <select
                value={formData.method}
                onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                style={styles.input}
              >
                <option value="transfer">轉帳</option>
                <option value="check">支票</option>
                <option value="cash">現金</option>
                <option value="credit">信用卡</option>
              </select>
            </div>
          </div>
          <button type="submit" style={styles.submitBtn}>確認登錄</button>
        </form>
      )}

      {/* 專案收款進度 */}
      {projects.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>專案收款進度</div>
          <div style={styles.progressGrid}>
            {projects.slice(0, 6).map(project => {
              const progress = calculatePaymentProgress(project);
              return (
                <div key={project.id} style={styles.progressCard}>
                  <div style={styles.progressHeader}>
                    <div>
                      <div style={styles.progressCode}>{project.project_code}</div>
                      <div style={styles.progressClient}>{project.client_name}</div>
                    </div>
                    <div style={styles.progressPercent}>{progress.percentage}%</div>
                  </div>
                  <div style={styles.progressBar}>
                    <div style={{
                      ...styles.progressFill,
                      width: `${Math.min(progress.percentage, 100)}%`,
                      background: progress.percentage >= 100 ? '#10b981' : '#2563eb'
                    }} />
                  </div>
                  <div style={styles.progressAmount}>
                    NT$ {progress.totalPaid.toLocaleString()} / {project.project_amount?.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 付款記錄列表（卡片式） */}
      {payments.length === 0 ? (
        <div style={{ ...styles.section, ...styles.empty }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>💳</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>尚無付款記錄</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>點擊上方按鈕登錄收款</div>
        </div>
      ) : (
        payments.map(payment => (
          <div key={payment.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={styles.projectCode}
                  onClick={() => window.location.href = `/projects/${payment.project_id}`}
                >
                  {payment.project?.project_code}
                </div>
                <div style={styles.clientName}>{payment.project?.client_name}</div>
              </div>
              <span style={styles.paymentDate}>
                {new Date(payment.payment_date).toLocaleDateString('zh-TW')}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b' }}>付款金額</div>
                <div style={styles.amount}>NT$ {payment.amount?.toLocaleString()}</div>
              </div>
              <span style={styles.badge}>{getMethodLabel(payment.method)}</span>
            </div>

            <div style={{ ...styles.cardRow, borderBottom: 'none' }}>
              <span style={styles.cardLabel}>專案總額</span>
              <span style={styles.cardValue}>NT$ {payment.project?.amount?.toLocaleString()}</span>
            </div>
            <div style={{ ...styles.cardRow, borderBottom: 'none' }}>
              <span style={styles.cardLabel}>付款模板</span>
              <span style={styles.cardValue}>{payment.project?.payment_template}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
