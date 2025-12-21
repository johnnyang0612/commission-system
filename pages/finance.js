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
      fetchLaborReceipts()
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

    // 勞報單數量
    const { count: laborCount } = await supabase
      .from('labor_receipts')
      .select('*', { count: 'exact', head: true });

    setStats({
      totalReceived,
      totalCommission,
      pendingPayout: 0,
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
      .limit(10);

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
      .limit(10);

    setRecentCommissions(data || []);
  }

  async function fetchLaborReceipts() {
    if (!supabase) return;

    const { data } = await supabase
      .from('labor_receipts')
      .select(`
        *,
        user:user_id (name)
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    setLaborReceipts(data || []);
  }

  const tabs = [
    { id: 'overview', label: '總覽', icon: '📊' },
    { id: 'payments', label: '收款', icon: '💳' },
    { id: 'commissions', label: '分潤', icon: '💰' },
    { id: 'labor', label: '勞報單', icon: '📋' }
  ];

  const styles = {
    page: { padding: 0 },
    header: { marginBottom: 20 },
    title: { fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' },
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
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 16,
      marginBottom: 24
    },
    statCard: {
      background: 'white',
      borderRadius: 12,
      padding: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    },
    statIcon: { fontSize: 32, marginBottom: 12 },
    statValue: { fontSize: 28, fontWeight: 700, color: '#1e293b', marginBottom: 4 },
    statLabel: { fontSize: 14, color: '#64748b' },
    section: {
      background: 'white',
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    },
    sectionTitle: { fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#1e293b' },
    list: { },
    listItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 0',
      borderBottom: '1px solid #f1f5f9',
      gap: 12
    },
    listItemLeft: { flex: 1, minWidth: 0 },
    listItemTitle: { fontSize: 14, fontWeight: 500, color: '#1e293b', marginBottom: 2 },
    listItemSub: { fontSize: 13, color: '#64748b' },
    listItemAmount: { fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' },
    badge: {
      padding: '4px 10px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 500
    },
    emptyState: {
      textAlign: 'center',
      padding: 40,
      color: '#94a3b8'
    },
    linkBtn: {
      padding: '8px 16px',
      background: '#f1f5f9',
      color: '#475569',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: 500
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
      {/* 頁面標題 */}
      <div style={styles.header}>
        <h1 style={styles.title}>財務中心</h1>
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
              <div style={styles.statIcon}>📋</div>
              <div style={styles.statValue}>{stats.laborReceipts}</div>
              <div style={styles.statLabel}>勞報單數</div>
            </div>
          </div>

          {/* 最近收款 */}
          <div style={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={styles.sectionTitle}>最近收款</div>
              <button onClick={() => setActiveTab('payments')} style={styles.linkBtn}>查看全部</button>
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

          {/* 最近分潤 */}
          <div style={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={styles.sectionTitle}>最近分潤撥款</div>
              <button onClick={() => setActiveTab('commissions')} style={styles.linkBtn}>查看全部</button>
            </div>
            {recentCommissions.slice(0, 5).map(comm => (
              <div key={comm.id} style={styles.listItem}>
                <div style={styles.listItemLeft}>
                  <div style={styles.listItemTitle}>
                    {comm.project?.client_name} - 第{comm.installment_number}期
                  </div>
                  <div style={styles.listItemSub}>{comm.commission_payment_date || '-'}</div>
                </div>
                <div style={{ ...styles.listItemAmount, color: '#8b5cf6' }}>
                  NT$ {comm.actual_commission?.toLocaleString()}
                </div>
              </div>
            ))}
            {recentCommissions.length === 0 && (
              <div style={styles.emptyState}>尚無分潤記錄</div>
            )}
          </div>
        </>
      )}

      {/* 收款 Tab */}
      {activeTab === 'payments' && (
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
      )}

      {/* 分潤 Tab */}
      {activeTab === 'commissions' && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>分潤撥款記錄</div>
          {recentCommissions.map(comm => (
            <div key={comm.id} style={styles.listItem}>
              <div style={styles.listItemLeft}>
                <div style={styles.listItemTitle}>
                  {comm.project?.project_code} - {comm.project?.client_name}
                </div>
                <div style={styles.listItemSub}>
                  第{comm.installment_number}期 · {comm.commission_payment_date || '未設定日期'}
                </div>
              </div>
              <div style={{ ...styles.listItemAmount, color: '#8b5cf6' }}>
                NT$ {comm.actual_commission?.toLocaleString()}
              </div>
            </div>
          ))}
          {recentCommissions.length === 0 && (
            <div style={styles.emptyState}>尚無分潤記錄</div>
          )}
        </div>
      )}

      {/* 勞報單 Tab */}
      {activeTab === 'labor' && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>勞報單記錄</div>
          {laborReceipts.map(receipt => (
            <div key={receipt.id} style={styles.listItem}>
              <div style={styles.listItemLeft}>
                <div style={styles.listItemTitle}>
                  {receipt.receipt_number} - {receipt.user?.name}
                </div>
                <div style={styles.listItemSub}>
                  {new Date(receipt.created_at).toLocaleDateString('zh-TW')}
                </div>
              </div>
              <div style={styles.listItemAmount}>
                NT$ {receipt.gross_amount?.toLocaleString()}
              </div>
            </div>
          ))}
          {laborReceipts.length === 0 && (
            <div style={styles.emptyState}>尚無勞報單</div>
          )}
        </div>
      )}
    </div>
  );
}
