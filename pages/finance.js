import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { getCurrentUser, getCurrentUserRole, USER_ROLES } from '../utils/permissions';

export default function Finance() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [stats, setStats] = useState({
    totalReceived: 0,
    totalCommission: 0,
    pendingPayout: 0,
    laborReceipts: 0
  });
  const [recentPayments, setRecentPayments] = useState([]);
  const [recentCommissions, setRecentCommissions] = useState([]);
  const [laborReceipts, setLaborReceipts] = useState([]);

  // 新增勞報單相關狀態
  const [showAddLaborReceipt, setShowAddLaborReceipt] = useState(false);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectInstallments, setProjectInstallments] = useState([]);
  const [laborReceiptForm, setLaborReceiptForm] = useState({
    project_id: '',
    installment_id: '',
    user_id: '',
    gross_amount: '',
    notes: ''
  });
  const [selectedUser, setSelectedUser] = useState(null);
  const [calculatedAmounts, setCalculatedAmounts] = useState({
    tax_amount: 0,
    insurance_amount: 0,
    net_amount: 0
  });
  const [submitting, setSubmitting] = useState(false);

  // 新增收款相關狀態
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [pendingInstallments, setPendingInstallments] = useState([]);
  const [paymentForm, setPaymentForm] = useState({
    installment_id: '',
    actual_amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const user = getCurrentUser();
    setCurrentUser(user);

    await Promise.all([
      fetchStats(),
      fetchRecentPayments(),
      fetchRecentCommissions(),
      fetchLaborReceipts(),
      fetchProjects(),
      fetchUsers(),
      fetchPendingInstallments()
    ]);

    setLoading(false);
  }

  async function fetchStats() {
    if (!supabase) return;

    // 總收款金額
    const { data: payments } = await supabase
      .from('project_installments')
      .select('actual_amount')
      .eq('status', 'paid')
      .not('actual_amount', 'is', null);

    const totalReceived = (payments || []).reduce((sum, p) => sum + (p.actual_amount || 0), 0);

    // 總分潤金額
    const { data: commissions } = await supabase
      .from('project_installments')
      .select('actual_commission')
      .not('actual_commission', 'is', null);

    const totalCommission = (commissions || []).reduce((sum, c) => sum + (c.actual_commission || 0), 0);

    // 待審核勞報單數量
    const { count: pendingCount } = await supabase
      .from('labor_receipts')
      .select('*', { count: 'exact', head: true })
      .in('workflow_status', ['pending_signature', 'signed']);

    // 勞報單數量
    const { count: laborCount } = await supabase
      .from('labor_receipts')
      .select('*', { count: 'exact', head: true });

    setStats({
      totalReceived,
      totalCommission,
      pendingPayout: pendingCount || 0,
      laborReceipts: laborCount || 0
    });
  }

  async function fetchRecentPayments() {
    if (!supabase) return;

    const { data } = await supabase
      .from('project_installments')
      .select(`
        *,
        project:project_id (
          client_name,
          project_code
        )
      `)
      .eq('status', 'paid')
      .not('actual_amount', 'is', null)
      .order('payment_date', { ascending: false })
      .limit(20);

    setRecentPayments(data || []);
  }

  async function fetchRecentCommissions() {
    if (!supabase) return;

    const { data } = await supabase
      .from('project_installments')
      .select(`
        *,
        project:project_id (
          client_name,
          project_code,
          assigned_to
        )
      `)
      .not('actual_commission', 'is', null)
      .gt('actual_commission', 0)
      .order('commission_payment_date', { ascending: false })
      .limit(20);

    setRecentCommissions(data || []);
  }

  async function fetchLaborReceipts() {
    if (!supabase) return;

    const { data } = await supabase
      .from('labor_receipts')
      .select(`
        *,
        user:user_id (name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    setLaborReceipts(data || []);
  }

  async function fetchProjects() {
    if (!supabase) return;

    const { data } = await supabase
      .from('projects')
      .select('id, project_code, client_name, project_name, assigned_to')
      .order('created_at', { ascending: false });

    setProjects(data || []);
  }

  async function fetchUsers() {
    if (!supabase) return;

    const { data } = await supabase
      .from('users')
      .select('id, name, email, national_id, registered_address, bank_name, bank_code, account_number, withholding_tax_rate')
      .order('name');

    setUsers(data || []);
  }

  async function fetchPendingInstallments() {
    if (!supabase) return;

    const { data } = await supabase
      .from('project_installments')
      .select(`
        *,
        project:project_id (
          client_name,
          project_code,
          project_name
        )
      `)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

    setPendingInstallments(data || []);
  }

  // 當選擇專案時，載入該專案的期數
  async function handleProjectChange(projectId) {
    setLaborReceiptForm({ ...laborReceiptForm, project_id: projectId, installment_id: '' });

    if (!projectId) {
      setProjectInstallments([]);
      setSelectedProject(null);
      return;
    }

    const project = projects.find(p => p.id === projectId);
    setSelectedProject(project);

    const { data } = await supabase
      .from('project_installments')
      .select('*')
      .eq('project_id', projectId)
      .order('installment_number');

    setProjectInstallments(data || []);

    // 自動選擇該專案的負責業務
    if (project?.assigned_to) {
      setLaborReceiptForm(prev => ({ ...prev, user_id: project.assigned_to }));
      const user = users.find(u => u.id === project.assigned_to);
      setSelectedUser(user);
    }
  }

  // 當選擇期數時，自動帶入分潤金額
  function handleInstallmentChange(installmentId) {
    setLaborReceiptForm({ ...laborReceiptForm, installment_id: installmentId });

    const installment = projectInstallments.find(i => i.id === installmentId);
    if (installment) {
      const grossAmount = installment.commission_amount || installment.actual_commission || 0;
      setLaborReceiptForm(prev => ({ ...prev, gross_amount: grossAmount.toString() }));
      calculateNetAmount(grossAmount, selectedUser);
    }
  }

  // 當選擇人員時，計算實領金額
  function handleUserChange(userId) {
    setLaborReceiptForm({ ...laborReceiptForm, user_id: userId });
    const user = users.find(u => u.id === userId);
    setSelectedUser(user);

    if (laborReceiptForm.gross_amount) {
      calculateNetAmount(parseFloat(laborReceiptForm.gross_amount), user);
    }
  }

  // 計算實領金額
  function calculateNetAmount(grossAmount, user) {
    if (!grossAmount || grossAmount <= 0) {
      setCalculatedAmounts({ tax_amount: 0, insurance_amount: 0, net_amount: 0 });
      return;
    }

    // 扣繳稅率（預設 10%）
    const taxRate = user?.withholding_tax_rate || 10;
    const taxAmount = grossAmount * (taxRate / 100);

    // 二代健保費（2.11%，僅在單筆超過 20,000 時扣繳）
    const insuranceAmount = grossAmount >= 20000 ? grossAmount * 0.0211 : 0;

    // 實領金額
    const netAmount = grossAmount - taxAmount - insuranceAmount;

    setCalculatedAmounts({
      tax_amount: Math.round(taxAmount),
      insurance_amount: Math.round(insuranceAmount),
      net_amount: Math.round(netAmount)
    });
  }

  // 當金額變更時重新計算
  function handleGrossAmountChange(value) {
    setLaborReceiptForm({ ...laborReceiptForm, gross_amount: value });
    if (value && selectedUser) {
      calculateNetAmount(parseFloat(value), selectedUser);
    }
  }

  // 新增勞報單
  async function handleAddLaborReceipt(e) {
    e.preventDefault();
    if (!supabase) return;

    // 驗證必填
    if (!laborReceiptForm.project_id || !laborReceiptForm.user_id || !laborReceiptForm.gross_amount) {
      alert('請填寫專案、人員和金額');
      return;
    }

    // 驗證用戶資料完整性
    if (!selectedUser?.national_id || !selectedUser?.bank_name || !selectedUser?.account_number) {
      alert('該人員尚未填寫完整個人資料（身分證、銀行帳戶），請先請該員工到個人資料頁面完善資訊');
      return;
    }

    setSubmitting(true);

    try {
      const grossAmount = parseFloat(laborReceiptForm.gross_amount);
      const project = projects.find(p => p.id === laborReceiptForm.project_id);

      const { data, error } = await supabase
        .from('labor_receipts')
        .insert([{
          project_id: laborReceiptForm.project_id,
          user_id: laborReceiptForm.user_id,
          receipt_date: new Date().toISOString().split('T')[0],
          gross_amount: grossAmount,
          tax_amount: calculatedAmounts.tax_amount,
          insurance_amount: calculatedAmounts.insurance_amount,
          net_amount: calculatedAmounts.net_amount,
          project_name: project?.project_name,
          project_code: project?.project_code,
          client_name: project?.client_name,
          recipient_name: selectedUser?.name,
          recipient_id: selectedUser?.national_id,
          recipient_address: selectedUser?.registered_address,
          status: 'draft',
          workflow_status: 'pending_signature',
          notes: laborReceiptForm.notes
        }])
        .select();

      if (error) throw error;

      alert('勞報單新增成功！');
      setShowAddLaborReceipt(false);
      setLaborReceiptForm({
        project_id: '',
        installment_id: '',
        user_id: '',
        gross_amount: '',
        notes: ''
      });
      setSelectedProject(null);
      setSelectedUser(null);
      setCalculatedAmounts({ tax_amount: 0, insurance_amount: 0, net_amount: 0 });

      await fetchLaborReceipts();
      await fetchStats();
    } catch (error) {
      console.error('新增勞報單失敗:', error);
      alert('新增勞報單失敗: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  // 新增收款記錄
  async function handleAddPayment(e) {
    e.preventDefault();
    if (!supabase) return;

    if (!paymentForm.installment_id || !paymentForm.actual_amount || !paymentForm.payment_date) {
      alert('請填寫完整收款資訊');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('project_installments')
        .update({
          status: 'paid',
          actual_amount: parseFloat(paymentForm.actual_amount),
          payment_date: paymentForm.payment_date,
          notes: paymentForm.notes
        })
        .eq('id', paymentForm.installment_id);

      if (error) throw error;

      alert('收款登錄成功！');
      setShowAddPayment(false);
      setPaymentForm({
        installment_id: '',
        actual_amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        notes: ''
      });

      await Promise.all([
        fetchRecentPayments(),
        fetchPendingInstallments(),
        fetchStats()
      ]);
    } catch (error) {
      console.error('收款登錄失敗:', error);
      alert('收款登錄失敗: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  // 更新勞報單狀態
  async function updateLaborReceiptStatus(receiptId, newStatus) {
    if (!supabase) return;

    const statusLabels = {
      'pending_signature': '待簽名',
      'signed': '已簽名',
      'approved': '已審核',
      'rejected': '已駁回'
    };

    if (!confirm(`確定要將狀態更新為「${statusLabels[newStatus]}」嗎？`)) return;

    try {
      const updateData = { workflow_status: newStatus };

      if (newStatus === 'approved') {
        updateData.approved_at = new Date().toISOString();
        updateData.status = 'paid';
      }

      const { error } = await supabase
        .from('labor_receipts')
        .update(updateData)
        .eq('id', receiptId);

      if (error) throw error;

      await fetchLaborReceipts();
      await fetchStats();
    } catch (error) {
      console.error('更新狀態失敗:', error);
      alert('更新狀態失敗: ' + error.message);
    }
  }

  const tabs = [
    { id: 'overview', label: '總覽', icon: '📊' },
    { id: 'payments', label: '收款', icon: '💳' },
    { id: 'labor', label: '勞報單', icon: '📋' }
  ];

  const WORKFLOW_STATUS = {
    'pending': { label: '待產生', color: '#94a3b8', bg: '#f1f5f9' },
    'pending_signature': { label: '待簽名', color: '#f59e0b', bg: '#fef3c7' },
    'downloaded': { label: '已下載', color: '#3b82f6', bg: '#dbeafe' },
    'signed': { label: '已簽名', color: '#8b5cf6', bg: '#ede9fe' },
    'approved': { label: '已審核', color: '#10b981', bg: '#d1fae5' },
    'rejected': { label: '已駁回', color: '#ef4444', bg: '#fee2e2' }
  };

  const styles = {
    page: { padding: 0 },
    header: { marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
    title: { fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' },
    headerActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
    actionBtn: {
      padding: '10px 16px',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 6
    },
    tabs: {
      display: 'flex',
      gap: 8,
      marginBottom: 20,
      overflowX: 'auto',
      paddingBottom: 4
    },
    tab: {
      padding: '10px 20px',
      border: 'none',
      borderRadius: 10,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      whiteSpace: 'nowrap',
      transition: 'all 0.2s'
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: 16,
      marginBottom: 24
    },
    statCard: {
      background: 'white',
      borderRadius: 12,
      padding: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    },
    statIcon: { fontSize: 28, marginBottom: 8 },
    statValue: { fontSize: 24, fontWeight: 700, color: '#1e293b', marginBottom: 4 },
    statLabel: { fontSize: 13, color: '#64748b' },
    section: {
      background: 'white',
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    },
    sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#1e293b' },
    listItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 0',
      borderBottom: '1px solid #f1f5f9',
      gap: 12,
      flexWrap: 'wrap'
    },
    listItemLeft: { flex: 1, minWidth: 150 },
    listItemTitle: { fontSize: 14, fontWeight: 500, color: '#1e293b', marginBottom: 2 },
    listItemSub: { fontSize: 13, color: '#64748b' },
    listItemAmount: { fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' },
    badge: {
      padding: '4px 10px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 500,
      display: 'inline-block'
    },
    emptyState: {
      textAlign: 'center',
      padding: 40,
      color: '#94a3b8'
    },
    modal: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: 20
    },
    modalContent: {
      background: 'white',
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 600,
      maxHeight: '90vh',
      overflowY: 'auto'
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 700,
      marginBottom: 20,
      color: '#1e293b'
    },
    formGroup: {
      marginBottom: 16
    },
    label: {
      display: 'block',
      marginBottom: 6,
      fontWeight: 500,
      color: '#374151',
      fontSize: 14
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid #d1d5db',
      borderRadius: 8,
      fontSize: 14,
      boxSizing: 'border-box'
    },
    select: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid #d1d5db',
      borderRadius: 8,
      fontSize: 14,
      boxSizing: 'border-box',
      background: 'white'
    },
    calcBox: {
      background: '#f8fafc',
      borderRadius: 12,
      padding: 16,
      marginTop: 16
    },
    calcRow: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '8px 0',
      borderBottom: '1px solid #e2e8f0'
    },
    calcTotal: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '12px 0 0',
      fontWeight: 700,
      fontSize: 18
    },
    btnRow: {
      display: 'flex',
      gap: 12,
      marginTop: 24
    },
    submitBtn: {
      flex: 1,
      padding: '12px',
      background: '#2563eb',
      color: 'white',
      border: 'none',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 600,
      cursor: 'pointer'
    },
    cancelBtn: {
      padding: '12px 24px',
      background: '#f1f5f9',
      color: '#64748b',
      border: 'none',
      borderRadius: 8,
      fontSize: 15,
      fontWeight: 500,
      cursor: 'pointer'
    },
    statusBtn: {
      padding: '6px 12px',
      border: 'none',
      borderRadius: 6,
      fontSize: 12,
      cursor: 'pointer',
      marginLeft: 8
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>載入中...</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* 頁面標題和操作按鈕 */}
      <div style={styles.header}>
        <h1 style={styles.title}>財務中心</h1>
        <div style={styles.headerActions}>
          <button
            onClick={() => setShowAddPayment(true)}
            style={{ ...styles.actionBtn, background: '#10b981', color: 'white' }}
          >
            <span>💳</span> 登錄收款
          </button>
          <button
            onClick={() => setShowAddLaborReceipt(true)}
            style={{ ...styles.actionBtn, background: '#8b5cf6', color: 'white' }}
          >
            <span>📋</span> 新增勞報單
          </button>
        </div>
      </div>

      {/* 標籤切換 */}
      <div style={styles.tabs}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              background: activeTab === tab.id ? '#2563eb' : '#f1f5f9',
              color: activeTab === tab.id ? 'white' : '#64748b'
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 總覽 Tab */}
      {activeTab === 'overview' && (
        <>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statIcon}>💳</div>
              <div style={{ ...styles.statValue, color: '#10b981' }}>
                {(stats.totalReceived / 10000).toFixed(1)}萬
              </div>
              <div style={styles.statLabel}>總收款金額</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}>💰</div>
              <div style={{ ...styles.statValue, color: '#8b5cf6' }}>
                {(stats.totalCommission / 10000).toFixed(1)}萬
              </div>
              <div style={styles.statLabel}>總分潤撥款</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}>⏳</div>
              <div style={{ ...styles.statValue, color: '#f59e0b' }}>
                {stats.pendingPayout}
              </div>
              <div style={styles.statLabel}>待審核勞報單</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statIcon}>📋</div>
              <div style={styles.statValue}>{stats.laborReceipts}</div>
              <div style={styles.statLabel}>勞報單總數</div>
            </div>
          </div>

          {/* 最近收款 */}
          <div style={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={styles.sectionTitle}>最近收款</div>
              <button onClick={() => setActiveTab('payments')} style={{ ...styles.actionBtn, background: '#f1f5f9', color: '#475569' }}>查看全部</button>
            </div>
            {recentPayments.slice(0, 5).map(payment => (
              <div key={payment.id} style={styles.listItem}>
                <div style={styles.listItemLeft}>
                  <div style={styles.listItemTitle}>
                    {payment.project?.client_name} - 第{payment.installment_number}期
                  </div>
                  <div style={styles.listItemSub}>{payment.payment_date}</div>
                </div>
                <div style={{ ...styles.listItemAmount, color: '#10b981' }}>
                  +NT$ {payment.actual_amount?.toLocaleString()}
                </div>
              </div>
            ))}
            {recentPayments.length === 0 && (
              <div style={styles.emptyState}>尚無收款記錄</div>
            )}
          </div>

          {/* 待審核勞報單 */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>待審核勞報單</div>
            {laborReceipts.filter(r => ['pending_signature', 'signed'].includes(r.workflow_status)).slice(0, 5).map(receipt => {
              const status = WORKFLOW_STATUS[receipt.workflow_status] || WORKFLOW_STATUS.pending;
              return (
                <div key={receipt.id} style={styles.listItem}>
                  <div style={styles.listItemLeft}>
                    <div style={styles.listItemTitle}>
                      {receipt.receipt_number} - {receipt.user?.name || receipt.recipient_name}
                    </div>
                    <div style={styles.listItemSub}>
                      {receipt.project_code} · {new Date(receipt.created_at).toLocaleDateString('zh-TW')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      ...styles.badge,
                      background: status.bg,
                      color: status.color
                    }}>
                      {status.label}
                    </span>
                    <span style={{ ...styles.listItemAmount, color: '#8b5cf6' }}>
                      NT$ {receipt.gross_amount?.toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
            {laborReceipts.filter(r => ['pending_signature', 'signed'].includes(r.workflow_status)).length === 0 && (
              <div style={styles.emptyState}>暫無待審核勞報單</div>
            )}
          </div>
        </>
      )}

      {/* 收款 Tab */}
      {activeTab === 'payments' && (
        <>
          {/* 待收款 */}
          <div style={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={styles.sectionTitle}>待收款項目</div>
              <button
                onClick={() => setShowAddPayment(true)}
                style={{ ...styles.actionBtn, background: '#10b981', color: 'white' }}
              >
                <span>💳</span> 登錄收款
              </button>
            </div>
            {pendingInstallments.slice(0, 10).map(inst => (
              <div key={inst.id} style={styles.listItem}>
                <div style={styles.listItemLeft}>
                  <div style={styles.listItemTitle}>
                    {inst.project?.project_code} - {inst.project?.client_name}
                  </div>
                  <div style={styles.listItemSub}>
                    第{inst.installment_number}期 · 預定 {inst.due_date}
                  </div>
                </div>
                <div style={{ ...styles.listItemAmount, color: '#f59e0b' }}>
                  NT$ {inst.amount?.toLocaleString()}
                </div>
              </div>
            ))}
            {pendingInstallments.length === 0 && (
              <div style={styles.emptyState}>暫無待收款項目</div>
            )}
          </div>

          {/* 已收款 */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>收款記錄</div>
            {recentPayments.map(payment => (
              <div key={payment.id} style={styles.listItem}>
                <div style={styles.listItemLeft}>
                  <div style={styles.listItemTitle}>
                    {payment.project?.project_code} - {payment.project?.client_name}
                  </div>
                  <div style={styles.listItemSub}>
                    第{payment.installment_number}期 · {payment.payment_date}
                  </div>
                </div>
                <div style={{ ...styles.listItemAmount, color: '#10b981' }}>
                  NT$ {payment.actual_amount?.toLocaleString()}
                </div>
              </div>
            ))}
            {recentPayments.length === 0 && (
              <div style={styles.emptyState}>尚無收款記錄</div>
            )}
          </div>
        </>
      )}

      {/* 勞報單 Tab */}
      {activeTab === 'labor' && (
        <div style={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={styles.sectionTitle}>勞報單記錄</div>
            <button
              onClick={() => setShowAddLaborReceipt(true)}
              style={{ ...styles.actionBtn, background: '#8b5cf6', color: 'white' }}
            >
              <span>📋</span> 新增勞報單
            </button>
          </div>
          {laborReceipts.map(receipt => {
            const status = WORKFLOW_STATUS[receipt.workflow_status] || WORKFLOW_STATUS.pending;
            return (
              <div key={receipt.id} style={styles.listItem}>
                <div style={styles.listItemLeft}>
                  <div style={styles.listItemTitle}>
                    {receipt.receipt_number} - {receipt.user?.name || receipt.recipient_name}
                  </div>
                  <div style={styles.listItemSub}>
                    {receipt.project_code} · {new Date(receipt.created_at).toLocaleDateString('zh-TW')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    ...styles.badge,
                    background: status.bg,
                    color: status.color
                  }}>
                    {status.label}
                  </span>
                  <span style={{ fontSize: 14, color: '#64748b' }}>
                    總額 NT$ {receipt.gross_amount?.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>
                    實領 NT$ {receipt.net_amount?.toLocaleString()}
                  </span>

                  {/* 狀態操作按鈕 */}
                  {receipt.workflow_status === 'pending_signature' && (
                    <button
                      onClick={() => updateLaborReceiptStatus(receipt.id, 'signed')}
                      style={{ ...styles.statusBtn, background: '#ede9fe', color: '#8b5cf6' }}
                    >
                      標記已簽名
                    </button>
                  )}
                  {receipt.workflow_status === 'signed' && (
                    <>
                      <button
                        onClick={() => updateLaborReceiptStatus(receipt.id, 'approved')}
                        style={{ ...styles.statusBtn, background: '#d1fae5', color: '#10b981' }}
                      >
                        審核通過
                      </button>
                      <button
                        onClick={() => updateLaborReceiptStatus(receipt.id, 'rejected')}
                        style={{ ...styles.statusBtn, background: '#fee2e2', color: '#ef4444' }}
                      >
                        駁回
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {laborReceipts.length === 0 && (
            <div style={styles.emptyState}>尚無勞報單</div>
          )}
        </div>
      )}

      {/* 新增勞報單 Modal */}
      {showAddLaborReceipt && (
        <div style={styles.modal} onClick={() => setShowAddLaborReceipt(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>新增勞報單</h2>

            <form onSubmit={handleAddLaborReceipt}>
              <div style={styles.formGroup}>
                <label style={styles.label}>選擇專案 *</label>
                <select
                  value={laborReceiptForm.project_id}
                  onChange={(e) => handleProjectChange(e.target.value)}
                  style={styles.select}
                  required
                >
                  <option value="">-- 請選擇專案 --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.project_code} - {p.client_name}
                    </option>
                  ))}
                </select>
              </div>

              {projectInstallments.length > 0 && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>選擇期數（自動帶入分潤金額）</label>
                  <select
                    value={laborReceiptForm.installment_id}
                    onChange={(e) => handleInstallmentChange(e.target.value)}
                    style={styles.select}
                  >
                    <option value="">-- 請選擇期數 --</option>
                    {projectInstallments.map(inst => (
                      <option key={inst.id} value={inst.id}>
                        第{inst.installment_number}期 - 分潤 NT$ {(inst.commission_amount || inst.actual_commission || 0).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>受領人 *</label>
                <select
                  value={laborReceiptForm.user_id}
                  onChange={(e) => handleUserChange(e.target.value)}
                  style={styles.select}
                  required
                >
                  <option value="">-- 請選擇人員 --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                {selectedUser && !selectedUser.national_id && (
                  <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>
                    ⚠️ 此人員尚未填寫身分證資料
                  </div>
                )}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>分潤金額 (總額) *</label>
                <input
                  type="number"
                  value={laborReceiptForm.gross_amount}
                  onChange={(e) => handleGrossAmountChange(e.target.value)}
                  placeholder="輸入分潤金額"
                  style={styles.input}
                  required
                  min="0"
                />
              </div>

              {calculatedAmounts.net_amount > 0 && (
                <div style={styles.calcBox}>
                  <div style={{ fontWeight: 600, marginBottom: 12, color: '#1e293b' }}>金額計算</div>
                  <div style={styles.calcRow}>
                    <span>分潤總額</span>
                    <span>NT$ {parseFloat(laborReceiptForm.gross_amount || 0).toLocaleString()}</span>
                  </div>
                  <div style={styles.calcRow}>
                    <span>扣繳稅額 ({selectedUser?.withholding_tax_rate || 10}%)</span>
                    <span style={{ color: '#ef4444' }}>- NT$ {calculatedAmounts.tax_amount.toLocaleString()}</span>
                  </div>
                  <div style={styles.calcRow}>
                    <span>二代健保 (2.11%){parseFloat(laborReceiptForm.gross_amount || 0) < 20000 ? ' - 未達門檻' : ''}</span>
                    <span style={{ color: '#f59e0b' }}>- NT$ {calculatedAmounts.insurance_amount.toLocaleString()}</span>
                  </div>
                  <div style={styles.calcTotal}>
                    <span>實領金額</span>
                    <span style={{ color: '#10b981' }}>NT$ {calculatedAmounts.net_amount.toLocaleString()}</span>
                  </div>
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>備註</label>
                <textarea
                  value={laborReceiptForm.notes}
                  onChange={(e) => setLaborReceiptForm({ ...laborReceiptForm, notes: e.target.value })}
                  placeholder="其他備註..."
                  rows={3}
                  style={{ ...styles.input, resize: 'vertical' }}
                />
              </div>

              <div style={styles.btnRow}>
                <button
                  type="button"
                  onClick={() => setShowAddLaborReceipt(false)}
                  style={styles.cancelBtn}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ ...styles.submitBtn, background: submitting ? '#94a3b8' : '#8b5cf6' }}
                >
                  {submitting ? '處理中...' : '新增勞報單'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增收款 Modal */}
      {showAddPayment && (
        <div style={styles.modal} onClick={() => setShowAddPayment(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>登錄收款</h2>

            <form onSubmit={handleAddPayment}>
              <div style={styles.formGroup}>
                <label style={styles.label}>選擇待收款項目 *</label>
                <select
                  value={paymentForm.installment_id}
                  onChange={(e) => {
                    const inst = pendingInstallments.find(i => i.id === e.target.value);
                    setPaymentForm({
                      ...paymentForm,
                      installment_id: e.target.value,
                      actual_amount: inst?.amount?.toString() || ''
                    });
                  }}
                  style={styles.select}
                  required
                >
                  <option value="">-- 請選擇 --</option>
                  {pendingInstallments.map(inst => (
                    <option key={inst.id} value={inst.id}>
                      {inst.project?.project_code} - {inst.project?.client_name} - 第{inst.installment_number}期 (NT$ {inst.amount?.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>實收金額 *</label>
                <input
                  type="number"
                  value={paymentForm.actual_amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, actual_amount: e.target.value })}
                  placeholder="輸入實收金額"
                  style={styles.input}
                  required
                  min="0"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>收款日期 *</label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>備註</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="收款備註..."
                  rows={3}
                  style={{ ...styles.input, resize: 'vertical' }}
                />
              </div>

              <div style={styles.btnRow}>
                <button
                  type="button"
                  onClick={() => setShowAddPayment(false)}
                  style={styles.cancelBtn}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ ...styles.submitBtn, background: submitting ? '#94a3b8' : '#10b981' }}
                >
                  {submitting ? '處理中...' : '確認收款'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
