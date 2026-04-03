import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';
import { processAdvancePayout } from '../utils/commissionEngineV2';

export default function CommissionCenter() {
  const router = useRouter();
  const { user, loading: authLoading } = useSimpleAuth();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  // --- Tab 1: Commission Overview state ---
  const [summaryStats, setSummaryStats] = useState({
    totalContract: 0,
    totalGrossReceived: 0,
    totalNetReceived: 0,
    totalCalculatedCommission: 0,
    totalPaid: 0,
    totalPending: 0,
    totalAdvanceRemaining: 0,
  });
  const [commissionEvents, setCommissionEvents] = useState([]);
  const [eventsFilter, setEventsFilter] = useState({
    project_id: '',
    user_id: '',
    status: '',
    date_from: '',
    date_to: '',
  });

  // --- Tab 2: Finance Transactions state ---
  const [transactions, setTransactions] = useState([]);
  const [txFilter, setTxFilter] = useState({
    transaction_type: '',
    project_id: '',
    date_from: '',
    date_to: '',
  });
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [txForm, setTxForm] = useState({
    transaction_type: 'customer_payment',
    project_id: '',
    user_id: '',
    amount: '',
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
    needs_labor_receipt: false,
  });

  // --- Tab 3: Advance Payouts state ---
  const [advances, setAdvances] = useState([]);
  const [advanceSummary, setAdvanceSummary] = useState({
    totalAdvanced: 0,
    totalOffset: 0,
    totalRemaining: 0,
  });
  const [showAddAdvance, setShowAddAdvance] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    project_id: '',
    user_id: '',
    amount: '',
    reason: '',
  });

  // --- Shared state ---
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // ========== Data Loading ==========

  const fetchProjects = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('projects')
      .select('id, project_code, client_name, project_name, amount, assigned_to')
      .order('created_at', { ascending: false });
    setProjects(data || []);
  }, []);

  const fetchUsers = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('users')
      .select('id, name, email, role')
      .order('name');
    setUsers(data || []);
  }, []);

  const fetchSummaryStats = useCallback(async () => {
    if (!supabase) return;

    // Total contract amount
    const { data: projectsData } = await supabase
      .from('projects')
      .select('amount');
    const totalContract = (projectsData || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

    // Commission events aggregation
    const { data: events } = await supabase
      .from('commission_events')
      .select('gross_received, net_received, calculated_commission, status')
      .neq('status', 'cancelled');

    const allEvents = events || [];
    const totalGrossReceived = allEvents.reduce((s, e) => s + (parseFloat(e.gross_received) || 0), 0);
    const totalNetReceived = allEvents.reduce((s, e) => s + (parseFloat(e.net_received) || 0), 0);

    const pendingApproved = allEvents.filter(e => e.status === 'pending' || e.status === 'approved');
    const totalCalculatedCommission = pendingApproved.reduce((s, e) => s + (parseFloat(e.calculated_commission) || 0), 0);

    const paid = allEvents.filter(e => e.status === 'paid');
    const totalPaid = paid.reduce((s, e) => s + (parseFloat(e.calculated_commission) || 0), 0);

    const totalPending = totalCalculatedCommission - totalPaid;

    // Advance remaining
    const { data: advData } = await supabase
      .from('payout_advance_records')
      .select('remaining_to_offset, offset_status')
      .neq('offset_status', 'fully_offset');
    const totalAdvanceRemaining = (advData || []).reduce((s, a) => s + (parseFloat(a.remaining_to_offset) || 0), 0);

    setSummaryStats({
      totalContract,
      totalGrossReceived,
      totalNetReceived,
      totalCalculatedCommission,
      totalPaid,
      totalPending: Math.max(0, totalPending),
      totalAdvanceRemaining,
    });
  }, []);

  const fetchCommissionEvents = useCallback(async () => {
    if (!supabase) return;

    let query = supabase
      .from('commission_events')
      .select(`
        *,
        project:project_id ( project_name, project_code, client_name ),
        user:user_id ( name, email )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (eventsFilter.project_id) query = query.eq('project_id', eventsFilter.project_id);
    if (eventsFilter.user_id) query = query.eq('user_id', eventsFilter.user_id);
    if (eventsFilter.status) query = query.eq('status', eventsFilter.status);
    if (eventsFilter.date_from) query = query.gte('created_at', eventsFilter.date_from);
    if (eventsFilter.date_to) query = query.lte('created_at', eventsFilter.date_to + 'T23:59:59');

    const { data } = await query;
    setCommissionEvents(data || []);
  }, [eventsFilter]);

  const fetchTransactions = useCallback(async () => {
    if (!supabase) return;

    let query = supabase
      .from('finance_transactions')
      .select(`
        *,
        project:project_id ( project_name, project_code, client_name ),
        user:user_id ( name, email ),
        labor_receipt:labor_receipt_id ( id, receipt_number, status )
      `)
      .order('transaction_date', { ascending: false })
      .limit(100);

    if (txFilter.transaction_type) query = query.eq('transaction_type', txFilter.transaction_type);
    if (txFilter.project_id) query = query.eq('project_id', txFilter.project_id);
    if (txFilter.date_from) query = query.gte('transaction_date', txFilter.date_from);
    if (txFilter.date_to) query = query.lte('transaction_date', txFilter.date_to);

    const { data } = await query;
    setTransactions(data || []);
  }, [txFilter]);

  const fetchAdvances = useCallback(async () => {
    if (!supabase) return;

    const { data } = await supabase
      .from('payout_advance_records')
      .select(`
        *,
        project:project_id ( project_name, project_code, client_name ),
        user:user_id ( name, email ),
        approver:approved_by ( name )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    const all = data || [];
    setAdvances(all);

    const totalAdvanced = all.reduce((s, a) => s + (parseFloat(a.advance_amount) || 0), 0);
    const totalRemaining = all.reduce((s, a) => s + (parseFloat(a.remaining_to_offset) || 0), 0);
    const totalOffset = totalAdvanced - totalRemaining;
    setAdvanceSummary({ totalAdvanced, totalOffset, totalRemaining });
  }, []);

  // Initial load
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;

    async function init() {
      setLoading(true);
      await Promise.all([fetchProjects(), fetchUsers()]);
      await loadTabData(activeTab);
      setLoading(false);
    }
    init();
  }, [authLoading, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when tab changes
  useEffect(() => {
    if (!user || loading) return;
    loadTabData(activeTab);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadTabData(tab) {
    if (tab === 'overview') {
      await Promise.all([fetchSummaryStats(), fetchCommissionEvents()]);
    } else if (tab === 'transactions') {
      await fetchTransactions();
    } else if (tab === 'advances') {
      await fetchAdvances();
    }
  }

  // Refetch when filters change
  useEffect(() => {
    if (!user || loading) return;
    if (activeTab === 'overview') fetchCommissionEvents();
  }, [eventsFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || loading) return;
    if (activeTab === 'transactions') fetchTransactions();
  }, [txFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ========== Handlers ==========

  async function handleAddTransaction(e) {
    e.preventDefault();
    if (!supabase) return;
    if (!txForm.amount || !txForm.transaction_type) {
      alert('請填寫交易類型和金額');
      return;
    }

    setSubmitting(true);
    try {
      const record = {
        transaction_type: txForm.transaction_type,
        project_id: txForm.project_id || null,
        user_id: txForm.user_id || null,
        amount: parseFloat(txForm.amount),
        currency: 'TWD',
        description: txForm.description || '',
        transaction_date: txForm.transaction_date,
        needs_labor_receipt: txForm.needs_labor_receipt,
      };

      const { error } = await supabase
        .from('finance_transactions')
        .insert([record]);

      if (error) throw error;

      alert('交易新增成功');
      setShowAddTransaction(false);
      setTxForm({
        transaction_type: 'customer_payment',
        project_id: '',
        user_id: '',
        amount: '',
        description: '',
        transaction_date: new Date().toISOString().split('T')[0],
        needs_labor_receipt: false,
      });
      await fetchTransactions();
    } catch (err) {
      console.error('新增交易失敗:', err);
      alert('新增交易失敗: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddAdvance(e) {
    e.preventDefault();
    if (!advanceForm.project_id || !advanceForm.user_id || !advanceForm.amount) {
      alert('請填寫專案、業務和金額');
      return;
    }

    setSubmitting(true);
    try {
      const result = await processAdvancePayout(
        advanceForm.project_id,
        advanceForm.user_id,
        parseFloat(advanceForm.amount),
        advanceForm.reason || '',
        user?.id || null
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      alert('預支新增成功');
      setShowAddAdvance(false);
      setAdvanceForm({ project_id: '', user_id: '', amount: '', reason: '' });
      await fetchAdvances();
    } catch (err) {
      console.error('新增預支失敗:', err);
      alert('新增預支失敗: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ========== Helpers ==========

  function getUserName(uid) {
    const u = users.find(u => u.id === uid);
    return u ? u.name : uid?.substring(0, 8) || '-';
  }

  function getProjectLabel(p) {
    if (!p) return '-';
    return p.project_name || p.project_code || '-';
  }

  function formatDate(d) {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString('zh-TW');
    } catch {
      return d;
    }
  }

  function formatMoney(n) {
    if (n == null || isNaN(n)) return 'NT$ 0';
    return 'NT$ ' + Number(n).toLocaleString();
  }

  const STATUS_MAP = {
    pending: { label: '待審核', color: '#64748b', bg: '#f1f5f9' },
    approved: { label: '已核准', color: '#2563eb', bg: '#dbeafe' },
    paid: { label: '已發放', color: '#10b981', bg: '#d1fae5' },
    cancelled: { label: '已取消', color: '#ef4444', bg: '#fee2e2' },
  };

  const TX_TYPE_MAP = {
    customer_payment: { label: '客戶收款', color: '#10b981', bg: '#d1fae5' },
    commission_payout: { label: '分潤撥付', color: '#2563eb', bg: '#dbeafe' },
    advance_payout: { label: '預支撥付', color: '#f97316', bg: '#ffedd5' },
    bonus: { label: '獎金', color: '#8b5cf6', bg: '#ede9fe' },
    subcontract_expense: { label: '外包費用', color: '#ef4444', bg: '#fee2e2' },
    maintenance_income: { label: '維護費收入', color: '#06b6d4', bg: '#cffafe' },
    adjustment: { label: '調整', color: '#64748b', bg: '#f1f5f9' },
    other: { label: '其他', color: '#64748b', bg: '#f1f5f9' },
  };

  const ADVANCE_STATUS_MAP = {
    pending: { label: '待沖銷', color: '#64748b', bg: '#f1f5f9' },
    partially_offset: { label: '部分沖銷', color: '#f97316', bg: '#ffedd5' },
    fully_offset: { label: '已沖銷', color: '#10b981', bg: '#d1fae5' },
  };

  function renderBadge(map, key) {
    const info = map[key] || { label: key || '-', color: '#64748b', bg: '#f1f5f9' };
    return (
      <span style={{
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 500,
        color: info.color,
        background: info.bg,
        whiteSpace: 'nowrap',
      }}>
        {info.label}
      </span>
    );
  }

  // ========== Styles ==========

  const s = {
    page: { maxWidth: 1200, margin: '0 auto', padding: '0 16px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    title: { fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 },
    backBtn: { padding: '8px 16px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 },
    tabs: { display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 },
    tab: (active) => ({
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
      transition: 'all 0.2s',
      background: active ? '#7c3aed' : '#f1f5f9',
      color: active ? 'white' : '#64748b',
    }),
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 },
    statCard: { background: 'white', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
    statValue: (color) => ({ fontSize: 20, fontWeight: 700, color: color || '#1e293b', marginBottom: 2 }),
    statLabel: { fontSize: 12, color: '#64748b' },
    card: { background: 'white', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
    cardTitle: { fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    filterRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
    filterSelect: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: 'white', minWidth: 120 },
    filterInput: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, minWidth: 130 },
    tableWrap: { overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12 },
    td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
    actionBtn: (bg) => ({
      padding: '8px 16px',
      background: bg || '#7c3aed',
      color: 'white',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: 500,
    }),
    emptyState: { textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20 },
    modalContent: { background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' },
    modalTitle: { fontSize: 20, fontWeight: 700, marginBottom: 20, color: '#1e293b' },
    formGroup: { marginBottom: 16 },
    label: { display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151', fontSize: 14 },
    input: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' },
    select: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', background: 'white' },
    btnRow: { display: 'flex', gap: 12, marginTop: 24 },
    submitBtn: { flex: 1, padding: '12px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' },
    cancelBtn: { padding: '12px 24px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer' },
  };

  // ========== Render Helpers ==========

  function renderOverviewTab() {
    return (
      <>
        {/* Summary cards */}
        <div style={s.statsGrid}>
          {[
            { label: '合約總額', value: summaryStats.totalContract, color: '#1e293b' },
            { label: '已收含稅', value: summaryStats.totalGrossReceived, color: '#0ea5e9' },
            { label: '已收未稅', value: summaryStats.totalNetReceived, color: '#2563eb' },
            { label: '應計分潤', value: summaryStats.totalCalculatedCommission, color: '#8b5cf6' },
            { label: '已發放', value: summaryStats.totalPaid, color: '#10b981' },
            { label: '待發放', value: summaryStats.totalPending, color: '#f59e0b' },
            { label: '預支未沖', value: summaryStats.totalAdvanceRemaining, color: '#ef4444' },
          ].map((item, i) => (
            <div key={i} style={s.statCard}>
              <div style={s.statValue(item.color)}>{formatMoney(item.value)}</div>
              <div style={s.statLabel}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Commission events table */}
        <div style={s.card}>
          <div style={s.cardTitle}>
            <span>分潤事件</span>
          </div>

          {/* Filters */}
          <div style={s.filterRow}>
            <select
              style={s.filterSelect}
              value={eventsFilter.project_id}
              onChange={e => setEventsFilter(f => ({ ...f, project_id: e.target.value }))}
            >
              <option value="">全部專案</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.project_name || p.project_code}</option>
              ))}
            </select>
            <select
              style={s.filterSelect}
              value={eventsFilter.user_id}
              onChange={e => setEventsFilter(f => ({ ...f, user_id: e.target.value }))}
            >
              <option value="">全部業務</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <select
              style={s.filterSelect}
              value={eventsFilter.status}
              onChange={e => setEventsFilter(f => ({ ...f, status: e.target.value }))}
            >
              <option value="">全部狀態</option>
              <option value="pending">待審核</option>
              <option value="approved">已核准</option>
              <option value="paid">已發放</option>
              <option value="cancelled">已取消</option>
            </select>
            <input
              type="date"
              style={s.filterInput}
              value={eventsFilter.date_from}
              onChange={e => setEventsFilter(f => ({ ...f, date_from: e.target.value }))}
              placeholder="開始日期"
            />
            <input
              type="date"
              style={s.filterInput}
              value={eventsFilter.date_to}
              onChange={e => setEventsFilter(f => ({ ...f, date_to: e.target.value }))}
              placeholder="結束日期"
            />
          </div>

          <div style={s.tableWrap}>
            {commissionEvents.length === 0 ? (
              <div style={s.emptyState}>尚無分潤事件</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>日期</th>
                    <th style={s.th}>專案</th>
                    <th style={s.th}>業務</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>含稅收款</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>未稅金額</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>分潤率</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>應計分潤</th>
                    <th style={s.th}>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionEvents.map(ev => (
                    <tr key={ev.id}>
                      <td style={s.td}>{formatDate(ev.created_at)}</td>
                      <td style={s.td}>{getProjectLabel(ev.project)}</td>
                      <td style={s.td}>{ev.user?.name || '-'}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 500 }}>{formatMoney(ev.gross_received)}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{formatMoney(ev.net_received)}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{ev.commission_rate ? (parseFloat(ev.commission_rate) * 100).toFixed(1) + '%' : '-'}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: '#8b5cf6' }}>{formatMoney(ev.calculated_commission)}</td>
                      <td style={s.td}>{renderBadge(STATUS_MAP, ev.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </>
    );
  }

  function renderTransactionsTab() {
    return (
      <div style={s.card}>
        <div style={s.cardTitle}>
          <span>交易記錄</span>
          <button
            onClick={() => setShowAddTransaction(true)}
            style={s.actionBtn('#2563eb')}
          >
            + 新增交易
          </button>
        </div>

        {/* Filters */}
        <div style={s.filterRow}>
          <select
            style={s.filterSelect}
            value={txFilter.transaction_type}
            onChange={e => setTxFilter(f => ({ ...f, transaction_type: e.target.value }))}
          >
            <option value="">全部類型</option>
            {Object.entries(TX_TYPE_MAP).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
          <select
            style={s.filterSelect}
            value={txFilter.project_id}
            onChange={e => setTxFilter(f => ({ ...f, project_id: e.target.value }))}
          >
            <option value="">全部專案</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.project_name || p.project_code}</option>
            ))}
          </select>
          <input
            type="date"
            style={s.filterInput}
            value={txFilter.date_from}
            onChange={e => setTxFilter(f => ({ ...f, date_from: e.target.value }))}
          />
          <input
            type="date"
            style={s.filterInput}
            value={txFilter.date_to}
            onChange={e => setTxFilter(f => ({ ...f, date_to: e.target.value }))}
          />
        </div>

        <div style={s.tableWrap}>
          {transactions.length === 0 ? (
            <div style={s.emptyState}>尚無交易記錄</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>日期</th>
                  <th style={s.th}>類型</th>
                  <th style={s.th}>專案</th>
                  <th style={s.th}>對象</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>金額</th>
                  <th style={s.th}>說明</th>
                  <th style={s.th}>需勞報單</th>
                  <th style={s.th}>勞報單</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => (
                  <tr key={tx.id}>
                    <td style={s.td}>{formatDate(tx.transaction_date)}</td>
                    <td style={s.td}>{renderBadge(TX_TYPE_MAP, tx.transaction_type)}</td>
                    <td style={s.td}>{getProjectLabel(tx.project)}</td>
                    <td style={s.td}>{tx.user?.name || '-'}</td>
                    <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{formatMoney(tx.amount)}</td>
                    <td style={{ ...s.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description || '-'}</td>
                    <td style={{ ...s.td, textAlign: 'center' }}>{tx.needs_labor_receipt ? '是' : '否'}</td>
                    <td style={s.td}>
                      {tx.labor_receipt ? (
                        <span style={{ color: '#10b981', fontSize: 12 }}>{tx.labor_receipt.receipt_number || '已建立'}</span>
                      ) : tx.needs_labor_receipt ? (
                        <span style={{ color: '#f59e0b', fontSize: 12 }}>待建立</span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  function renderAdvancesTab() {
    return (
      <>
        {/* Advance summary cards */}
        <div style={{ ...s.statsGrid, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div style={s.statCard}>
            <div style={s.statValue('#f97316')}>{formatMoney(advanceSummary.totalAdvanced)}</div>
            <div style={s.statLabel}>預支總額</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statValue('#10b981')}>{formatMoney(advanceSummary.totalOffset)}</div>
            <div style={s.statLabel}>已沖銷</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statValue('#ef4444')}>{formatMoney(advanceSummary.totalRemaining)}</div>
            <div style={s.statLabel}>待沖餘額</div>
          </div>
        </div>

        <div style={s.card}>
          <div style={s.cardTitle}>
            <span>預支紀錄</span>
            <button
              onClick={() => setShowAddAdvance(true)}
              style={s.actionBtn('#f97316')}
            >
              + 新增預支
            </button>
          </div>

          <div style={s.tableWrap}>
            {advances.length === 0 ? (
              <div style={s.emptyState}>尚無預支紀錄</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>日期</th>
                    <th style={s.th}>專案</th>
                    <th style={s.th}>業務</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>預支金額</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>待沖餘額</th>
                    <th style={s.th}>沖銷狀態</th>
                    <th style={s.th}>原因</th>
                    <th style={s.th}>核准人</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map(adv => (
                    <tr key={adv.id}>
                      <td style={s.td}>{formatDate(adv.created_at)}</td>
                      <td style={s.td}>{getProjectLabel(adv.project)}</td>
                      <td style={s.td}>{adv.user?.name || '-'}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{formatMoney(adv.advance_amount)}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: parseFloat(adv.remaining_to_offset) > 0 ? '#ef4444' : '#10b981' }}>
                        {formatMoney(adv.remaining_to_offset)}
                      </td>
                      <td style={s.td}>{renderBadge(ADVANCE_STATUS_MAP, adv.offset_status)}</td>
                      <td style={{ ...s.td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adv.reason || '-'}</td>
                      <td style={s.td}>{adv.approver?.name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </>
    );
  }

  // ========== Modals ==========

  function renderAddTransactionModal() {
    if (!showAddTransaction) return null;
    return (
      <div style={s.modal} onClick={() => setShowAddTransaction(false)}>
        <div style={s.modalContent} onClick={e => e.stopPropagation()}>
          <h2 style={s.modalTitle}>新增交易</h2>
          <form onSubmit={handleAddTransaction}>
            <div style={s.formGroup}>
              <label style={s.label}>交易類型 *</label>
              <select
                style={s.select}
                value={txForm.transaction_type}
                onChange={e => setTxForm(f => ({ ...f, transaction_type: e.target.value }))}
              >
                {Object.entries(TX_TYPE_MAP).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>專案</label>
              <select
                style={s.select}
                value={txForm.project_id}
                onChange={e => setTxForm(f => ({ ...f, project_id: e.target.value }))}
              >
                <option value="">-- 不指定 --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.client_name} - {p.project_name || p.project_code}</option>
                ))}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>對象</label>
              <select
                style={s.select}
                value={txForm.user_id}
                onChange={e => setTxForm(f => ({ ...f, user_id: e.target.value }))}
              >
                <option value="">-- 不指定 --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>金額 (TWD) *</label>
              <input
                type="number"
                style={s.input}
                value={txForm.amount}
                onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                min="0"
                step="1"
              />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>說明</label>
              <input
                type="text"
                style={s.input}
                value={txForm.description}
                onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))}
                placeholder="交易說明"
              />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>日期</label>
              <input
                type="date"
                style={s.input}
                value={txForm.transaction_date}
                onChange={e => setTxForm(f => ({ ...f, transaction_date: e.target.value }))}
              />
            </div>
            <div style={s.formGroup}>
              <label style={{ ...s.label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={txForm.needs_labor_receipt}
                  onChange={e => setTxForm(f => ({ ...f, needs_labor_receipt: e.target.checked }))}
                />
                需要勞報單
              </label>
            </div>

            <div style={s.btnRow}>
              <button type="button" onClick={() => setShowAddTransaction(false)} style={s.cancelBtn}>取消</button>
              <button type="submit" disabled={submitting} style={{ ...s.submitBtn, opacity: submitting ? 0.6 : 1 }}>
                {submitting ? '處理中...' : '新增交易'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderAddAdvanceModal() {
    if (!showAddAdvance) return null;
    return (
      <div style={s.modal} onClick={() => setShowAddAdvance(false)}>
        <div style={s.modalContent} onClick={e => e.stopPropagation()}>
          <h2 style={s.modalTitle}>新增預支</h2>
          <form onSubmit={handleAddAdvance}>
            <div style={s.formGroup}>
              <label style={s.label}>專案 *</label>
              <select
                style={s.select}
                value={advanceForm.project_id}
                onChange={e => setAdvanceForm(f => ({ ...f, project_id: e.target.value }))}
              >
                <option value="">-- 選擇專案 --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.client_name} - {p.project_name || p.project_code}</option>
                ))}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>業務 *</label>
              <select
                style={s.select}
                value={advanceForm.user_id}
                onChange={e => setAdvanceForm(f => ({ ...f, user_id: e.target.value }))}
              >
                <option value="">-- 選擇業務 --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>預支金額 (TWD) *</label>
              <input
                type="number"
                style={s.input}
                value={advanceForm.amount}
                onChange={e => setAdvanceForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
                min="1"
                step="1"
              />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>預支原因</label>
              <input
                type="text"
                style={s.input}
                value={advanceForm.reason}
                onChange={e => setAdvanceForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="例：專案前期費用"
              />
            </div>

            <div style={{ background: '#fffbeb', borderRadius: 8, padding: 12, marginTop: 8, fontSize: 13, color: '#92400e' }}>
              提示：新增預支後系統會自動建立財務交易紀錄與勞報單，並在未來分潤撥付時自動沖銷。
            </div>

            <div style={s.btnRow}>
              <button type="button" onClick={() => setShowAddAdvance(false)} style={s.cancelBtn}>取消</button>
              <button type="submit" disabled={submitting} style={{ ...s.submitBtn, background: '#f97316', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? '處理中...' : '新增預支'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ========== Main Render ==========

  if (authLoading || loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>載入中...</div>
      </div>
    );
  }

  if (!user) return null;

  // 權限檢查：僅限管理員及財務角色
  if (user.role !== 'admin' && user.role !== 'finance') {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>無權限存取</div>
        <div style={{ fontSize: 14, color: '#64748b', marginTop: 8 }}>分潤中心僅限管理員及財務角色使用</div>
      </div>
    );
  }

  const tabList = [
    { id: 'overview', label: '分潤總覽', icon: '📊' },
    { id: 'transactions', label: '交易記錄', icon: '💳' },
    { id: 'advances', label: '預支管理', icon: '🏦' },
  ];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>分潤中心</h1>
        <button onClick={() => router.push('/finance')} style={s.backBtn}>
          返回財務中心
        </button>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {tabList.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={s.tab(activeTab === tab.id)}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'transactions' && renderTransactionsTab()}
      {activeTab === 'advances' && renderAdvancesTab()}

      {/* Modals */}
      {renderAddTransactionModal()}
      {renderAddAdvanceModal()}
    </div>
  );
}
