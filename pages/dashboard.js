import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { supabase } from '../utils/supabaseClient';
import { getCurrentUser, USER_ROLES } from '../utils/permissions';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { exportDashboardToExcel } from '../utils/exportUtils';
import styles from '../styles/Dashboard.module.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    overview: {},
    recentProjects: [],
    pendingActions: [],
    monthlyRevenue: [],
    teamPerformance: [],
    pipelineStatus: {},
    commissionForecast: []
  });

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/login');
        return;
      }

      // 先獲取用戶資料
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      let currentUser;
      if (error || !userData) {
        // 如果沒有找到用戶資料，創建基本用戶對象
        currentUser = {
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
          role: 'admin' // 預設給管理員權限
        };
      } else {
        currentUser = userData;
      }

      setUser(currentUser);

      // 根據角色載入不同的數據
      await loadRoleSpecificData(currentUser);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      // 設置一個預設用戶以防止頁面崩潰
      setUser({
        id: 'default',
        email: 'default@example.com',
        name: 'Default User',
        role: 'admin'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRoleSpecificData = async (currentUser) => {
    const role = currentUser?.role;
    
    switch (role) {
      case USER_ROLES.ADMIN:
        await loadAdminDashboard();
        break;
      case USER_ROLES.LEADER:
        await loadLeaderDashboard();
        break;
      case USER_ROLES.SALES:
        await loadSalesDashboard(currentUser.id);
        break;
      case USER_ROLES.FINANCE:
        await loadFinanceDashboard();
        break;
      default:
        await loadDefaultDashboard();
    }
  };

  const loadAdminDashboard = async () => {
    try {
      // 載入公司總覽數據
      const [projectsRes, prospectsRes, commissionsRes, paymentsRes] = await Promise.all([
        supabase.from('projects').select('amount, type, created_at').then(res => {
          console.log('Projects data:', res);
          return res;
        }),
        supabase.from('prospects').select('estimated_amount, stage, created_at').then(res => {
          console.log('Prospects data:', res);
          return res;
        }).catch(err => {
          console.warn('Prospects table might not exist yet:', err);
          return { data: [], error: null };
        }),
        supabase.from('commissions').select('amount, status').then(res => {
          console.log('Commissions data:', res);
          return res;
        }),
        supabase.from('project_installments').select('amount, actual_amount, status, payment_date').then(res => {
          console.log('Project installments data:', res);
          return res;
        })
      ]);

      // 計算總覽統計（含稅收入）
      console.log('Raw data lengths:', {
        projects: projectsRes.data?.length || 0,
        prospects: prospectsRes.data?.length || 0,
        commissions: commissionsRes.data?.length || 0,
        payments: paymentsRes.data?.length || 0
      });

      const totalRevenue = projectsRes.data?.reduce((sum, p) => {
        const baseAmount = parseFloat(p.amount || 0);
        const taxAmount = baseAmount * 0.05; // 5% 營業稅
        return sum + baseAmount + taxAmount;
      }, 0) || 0;
      
      const totalPipeline = prospectsRes.data
        ?.filter(p => !['已失單', '已轉換'].includes(p.stage))
        .reduce((sum, p) => sum + parseFloat(p.estimated_amount || 0), 0) || 0;
      
      // 計算所有分潤金額，不僅僅是已付的
      const totalCommissions = commissionsRes.data
        ?.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0) || 0;
      
      const conversionRate = prospectsRes.data?.length > 0
        ? (prospectsRes.data.filter(p => p.stage === '已轉換').length / prospectsRes.data.length * 100).toFixed(1)
        : 0;

      console.log('Calculated values:', {
        totalRevenue,
        totalPipeline,
        totalCommissions,
        conversionRate
      });

      // 載入月度營收趨勢
      const monthlyRevenue = generateMonthlyRevenue(paymentsRes.data);

      // 載入團隊績效
      const { data: teamData } = await supabase
        .from('users')
        .select(`
          id, name, role,
          projects:projects!assigned_to(amount),
          prospects:prospects!owner_id(estimated_amount, stage)
        `)
        .in('role', ['sales', 'leader']);

      const teamPerformance = teamData?.map(member => ({
        name: member.name,
        revenue: member.projects?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0,
        pipeline: member.prospects
          ?.filter(p => !['已失單', '已轉換'].includes(p.stage))
          .reduce((sum, p) => sum + parseFloat(p.estimated_amount || 0), 0) || 0,
        deals: member.projects?.length || 0
      })) || [];

      // 載入待辦事項
      const pendingActions = await loadPendingActions();

      setDashboardData({
        overview: {
          totalRevenue,
          totalPipeline,
          totalCommissions,
          conversionRate,
          totalProjects: projectsRes.data?.length || 0,
          activeProspects: prospectsRes.data?.filter(p => !['已失單', '已轉換'].includes(p.stage)).length || 0
        },
        monthlyRevenue,
        teamPerformance,
        pendingActions,
        recentProjects: projectsRes.data?.slice(0, 5) || []
      });
    } catch (error) {
      console.error('Error loading admin dashboard:', error);
    }
  };

  const loadLeaderDashboard = async () => {
    try {
      // 載入團隊Pipeline數據
      const { data: teamMembers } = await supabase
        .from('users')
        .select('id, name')
        .eq('role', 'sales');

      const pipelineData = [];
      for (const member of teamMembers || []) {
        const { data: prospects } = await supabase
          .from('prospects')
          .select('stage, estimated_amount')
          .eq('owner_id', member.id);
        
        pipelineData.push({
          name: member.name,
          初談: prospects?.filter(p => p.stage === '初談').length || 0,
          報價中: prospects?.filter(p => p.stage === '報價中').length || 0,
          等客戶回覆: prospects?.filter(p => p.stage === '等客戶回覆').length || 0,
          確認簽約: prospects?.filter(p => p.stage === '確認簽約').length || 0
        });
      }

      // 載入轉換率數據
      const { data: allProspects } = await supabase
        .from('prospects')
        .select('stage, created_at, conversion_date');
      
      const conversionData = calculateConversionFunnel(allProspects);

      // 載入預估業績
      const estimatedRevenue = await calculateEstimatedRevenue();

      setDashboardData(prev => ({
        ...prev,
        pipelineStatus: pipelineData,
        conversionFunnel: conversionData,
        estimatedRevenue
      }));
    } catch (error) {
      console.error('Error loading leader dashboard:', error);
    }
  };

  const loadSalesDashboard = async (userId) => {
    try {
      // 載入個人專案和洽談案
      const [projectsRes, prospectsRes, commissionsRes] = await Promise.all([
        supabase.from('projects').select('*').eq('assigned_to', userId),
        supabase.from('prospects').select('*').eq('owner_id', userId),
        supabase.from('commissions').select('*').eq('user_id', userId)
      ]);

      // 計算個人統計
      const myRevenue = projectsRes.data?.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0;
      const myPipeline = prospectsRes.data
        ?.filter(p => !['已失單', '已轉換'].includes(p.stage))
        .reduce((sum, p) => sum + parseFloat(p.estimated_amount || 0), 0) || 0;
      const myCommissions = commissionsRes.data
        ?.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0) || 0;
      const pendingCommissions = commissionsRes.data
        ?.filter(c => c.status === 'pending')
        .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0) || 0;

      // 載入分潤預測
      const commissionForecast = generateCommissionForecast(commissionsRes.data, prospectsRes.data);

      // 載入待辦事項
      const myTodos = await loadMyTodos(userId);

      setDashboardData({
        overview: {
          myRevenue,
          myPipeline,
          myCommissions,
          pendingCommissions,
          activeProjects: projectsRes.data?.length || 0,
          activeProspects: prospectsRes.data?.filter(p => !['已失單', '已轉換'].includes(p.stage)).length || 0
        },
        commissionForecast,
        myProjects: projectsRes.data?.slice(0, 5) || [],
        myProspects: prospectsRes.data?.slice(0, 5) || [],
        pendingActions: myTodos
      });
    } catch (error) {
      console.error('Error loading sales dashboard:', error);
    }
  };

  const loadFinanceDashboard = async () => {
    try {
      // 載入財務統計
      const [paymentsRes, costsRes, receiptsRes] = await Promise.all([
        supabase.from('project_installments').select('*'),
        supabase.from('project_costs').select('*'),
        supabase.from('labor_receipts').select('*')
      ]);

      // 計算收款統計
      const totalReceived = paymentsRes.data
        ?.filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0;
      const totalPending = paymentsRes.data
        ?.filter(p => p.status === 'unpaid')
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0;
      const totalOverdue = paymentsRes.data
        ?.filter(p => p.status === 'overdue')
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) || 0;

      // 計算成本統計
      const totalCosts = costsRes.data?.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0) || 0;
      const unpaidCosts = costsRes.data
        ?.filter(c => !c.is_paid)
        .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0) || 0;

      // 計算稅務統計
      const totalTax = receiptsRes.data
        ?.reduce((sum, r) => sum + parseFloat(r.tax_amount || 0), 0) || 0;

      // 生成月度收支圖表
      const monthlyFinance = generateMonthlyFinance(paymentsRes.data, costsRes.data);

      // 載入逾期清單
      const overdueList = await loadOverduePayments();

      setDashboardData({
        overview: {
          totalReceived,
          totalPending,
          totalOverdue,
          totalCosts,
          unpaidCosts,
          totalTax,
          netProfit: totalReceived - totalCosts
        },
        monthlyFinance,
        overdueList,
        recentReceipts: receiptsRes.data?.slice(0, 5) || []
      });
    } catch (error) {
      console.error('Error loading finance dashboard:', error);
    }
  };

  const loadDefaultDashboard = async () => {
    // 載入基本數據
    const { data: projects } = await supabase
      .from('projects')
      .select('*')
      .limit(10);
    
    setDashboardData({
      recentProjects: projects || []
    });
  };

  // 輔助函數
  const generateMonthlyRevenue = (payments) => {
    const monthlyData = {};
    const currentDate = new Date();
    
    // 初始化最近6個月
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = 0;
    }

    // 統計每月收款
    payments?.forEach(payment => {
      if (payment.payment_date && payment.status === 'paid') {
        const date = new Date(payment.payment_date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyData[key] !== undefined) {
          monthlyData[key] += parseFloat(payment.actual_amount || payment.amount || 0);
        }
      }
    });

    return Object.entries(monthlyData).map(([month, amount]) => ({
      month: month.substring(5),
      amount
    }));
  };

  const generateCommissionForecast = (commissions, prospects) => {
    const forecast = [];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    for (let i = 0; i < 3; i++) {
      const month = new Date(currentYear, currentMonth + i, 1);
      const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      
      // 實際分潤
      const actualCommission = commissions
        ?.filter(c => {
          if (!c.created_at) return false;
          const date = new Date(c.created_at);
          return date.getFullYear() === month.getFullYear() && 
                 date.getMonth() === month.getMonth();
        })
        .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0) || 0;

      // 預估分潤（從洽談案）
      const estimatedCommission = prospects
        ?.filter(p => {
          if (!p.expected_sign_date || ['已失單', '已轉換'].includes(p.stage)) return false;
          const date = new Date(p.expected_sign_date);
          return date.getFullYear() === month.getFullYear() && 
                 date.getMonth() === month.getMonth();
        })
        .reduce((sum, p) => sum + (parseFloat(p.estimated_amount || 0) * parseFloat(p.commission_rate || 0) / 100), 0) || 0;

      forecast.push({
        month: `${month.getMonth() + 1}月`,
        actual: actualCommission,
        estimated: estimatedCommission
      });
    }

    return forecast;
  };

  const calculateConversionFunnel = (prospects) => {
    const stages = ['初談', '報價中', '等客戶回覆', '確認簽約', '已轉換'];
    const funnel = [];
    let previousCount = prospects?.length || 0;

    stages.forEach(stage => {
      const count = prospects?.filter(p => {
        const stageIndex = stages.indexOf(p.stage);
        return stageIndex >= stages.indexOf(stage);
      }).length || 0;

      funnel.push({
        stage,
        count,
        rate: previousCount > 0 ? (count / previousCount * 100).toFixed(1) : 0
      });
      previousCount = count;
    });

    return funnel;
  };

  const calculateEstimatedRevenue = async () => {
    const { data: prospects } = await supabase
      .from('prospects')
      .select('estimated_amount, stage, expected_sign_date')
      .not('stage', 'in', '("已失單","已轉換")');

    const estimatedByStage = {
      '初談': prospects?.filter(p => p.stage === '初談')
        .reduce((sum, p) => sum + parseFloat(p.estimated_amount || 0) * 0.1, 0) || 0, // 10%機率
      '報價中': prospects?.filter(p => p.stage === '報價中')
        .reduce((sum, p) => sum + parseFloat(p.estimated_amount || 0) * 0.3, 0) || 0, // 30%機率
      '等客戶回覆': prospects?.filter(p => p.stage === '等客戶回覆')
        .reduce((sum, p) => sum + parseFloat(p.estimated_amount || 0) * 0.5, 0) || 0, // 50%機率
      '確認簽約': prospects?.filter(p => p.stage === '確認簽約')
        .reduce((sum, p) => sum + parseFloat(p.estimated_amount || 0) * 0.9, 0) || 0 // 90%機率
    };

    return estimatedByStage;
  };

  const loadPendingActions = async () => {
    const actions = [];
    
    // 載入逾期收款
    const { data: overduePayments } = await supabase
      .from('project_installments')
      .select(`
        *,
        project:projects(project_code, client_name)
      `)
      .eq('status', 'overdue');

    overduePayments?.forEach(payment => {
      actions.push({
        type: 'overdue_payment',
        title: `逾期收款：${payment.project?.client_name}`,
        description: `${payment.project?.project_code} - 第${payment.installment_number}期`,
        amount: payment.amount,
        priority: 'high'
      });
    });

    // 載入即將到期的洽談案
    const { data: expiringProspects } = await supabase
      .from('prospects')
      .select('*')
      .not('stage', 'in', '("已失單","已轉換")')
      .lte('expected_sign_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())
      .gte('expected_sign_date', new Date().toISOString());

    expiringProspects?.forEach(prospect => {
      actions.push({
        type: 'expiring_prospect',
        title: `洽談案即將到期：${prospect.project_name}`,
        description: `${prospect.client_name} - ${prospect.stage}`,
        date: prospect.expected_sign_date,
        priority: 'medium'
      });
    });

    return actions;
  };

  const loadMyTodos = async (userId) => {
    const todos = [];
    
    // 載入待收分潤
    const { data: pendingCommissions } = await supabase
      .from('commissions')
      .select(`
        *,
        project:projects(project_code, client_name)
      `)
      .eq('user_id', userId)
      .eq('status', 'pending');

    pendingCommissions?.forEach(commission => {
      todos.push({
        type: 'pending_commission',
        title: `待收分潤：${commission.project?.client_name}`,
        amount: commission.amount,
        priority: 'low'
      });
    });

    // 載入需要跟進的洽談案
    const { data: myProspects } = await supabase
      .from('prospects')
      .select('*')
      .eq('owner_id', userId)
      .in('stage', ['報價中', '等客戶回覆']);

    myProspects?.forEach(prospect => {
      const daysSinceUpdate = Math.floor((Date.now() - new Date(prospect.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceUpdate > 7) {
        todos.push({
          type: 'follow_up',
          title: `需要跟進：${prospect.project_name}`,
          description: `${prospect.client_name} - 已${daysSinceUpdate}天未更新`,
          priority: 'medium'
        });
      }
    });

    return todos;
  };

  const loadOverduePayments = async () => {
    const { data } = await supabase
      .from('project_installments')
      .select(`
        *,
        project:projects(project_code, client_name, assigned_to)
      `)
      .eq('status', 'overdue');

    return data || [];
  };

  const generateMonthlyFinance = (payments, costs) => {
    const monthlyData = {};
    const currentDate = new Date();
    
    // 初始化最近6個月
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = { revenue: 0, cost: 0 };
    }

    // 統計收入
    payments?.forEach(payment => {
      if (payment.payment_date && payment.status === 'paid') {
        const date = new Date(payment.payment_date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyData[key]) {
          monthlyData[key].revenue += parseFloat(payment.actual_amount || payment.amount || 0);
        }
      }
    });

    // 統計成本
    costs?.forEach(cost => {
      if (cost.cost_date) {
        const date = new Date(cost.cost_date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyData[key]) {
          monthlyData[key].cost += parseFloat(cost.amount || 0);
        }
      }
    });

    return Object.entries(monthlyData).map(([month, data]) => ({
      month: month.substring(5),
      revenue: data.revenue,
      cost: data.cost,
      profit: data.revenue - data.cost
    }));
  };

  // 渲染不同角色的儀表板
  const renderDashboard = () => {
    if (!user) return null;

    switch (user.role) {
      case USER_ROLES.ADMIN:
        return renderAdminDashboard();
      case USER_ROLES.LEADER:
        return renderLeaderDashboard();
      case USER_ROLES.SALES:
        return renderSalesDashboard();
      case USER_ROLES.FINANCE:
        return renderFinanceDashboard();
      default:
        return renderDefaultDashboard();
    }
  };

  const renderAdminDashboard = () => (
    <div className={styles.dashboard}>
      <div className={styles.pageHeader}>
        <div>
          <h2>公司營運總覽</h2>
          <p className={styles.welcome}>歡迎回來，{user?.name}</p>
        </div>
        <button 
          className={styles.exportButton}
          onClick={() => exportDashboardToExcel(dashboardData, user?.role, '公司營運總覽')}
        >
          📥 匯出報表
        </button>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#10b981' }}>
            💰
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>總營收</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.totalRevenue?.toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#3b82f6' }}>
            📊
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>Pipeline價值</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.totalPipeline?.toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#f59e0b' }}>
            💵
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>已撥分潤</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.totalCommissions?.toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#8b5cf6' }}>
            📈
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>成案率</p>
            <p className={styles.statValue}>
              {dashboardData.overview.conversionRate}%
            </p>
          </div>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <h3>月度營收趨勢</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dashboardData.monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `NT$ ${value.toLocaleString()}`} />
              <Area type="monotone" dataKey="amount" stroke="#8884d8" fill="#8884d8" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <h3>團隊績效排名</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dashboardData.teamPerformance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => `NT$ ${value.toLocaleString()}`} />
              <Legend />
              <Bar dataKey="revenue" fill="#8884d8" name="成交金額" />
              <Bar dataKey="pipeline" fill="#82ca9d" name="Pipeline" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {dashboardData.pendingActions?.length > 0 && (
        <div className={styles.actionsSection}>
          <h3>待辦事項</h3>
          <div className={styles.actionsList}>
            {dashboardData.pendingActions.map((action, index) => (
              <div key={index} className={`${styles.actionItem} ${styles[action.priority]}`}>
                <div className={styles.actionIcon}>
                  {action.type === 'overdue_payment' ? '⚠️' : '📅'}
                </div>
                <div className={styles.actionContent}>
                  <p className={styles.actionTitle}>{action.title}</p>
                  <p className={styles.actionDesc}>{action.description}</p>
                </div>
                {action.amount && (
                  <div className={styles.actionAmount}>
                    NT$ {action.amount.toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderLeaderDashboard = () => (
    <div className={styles.dashboard}>
      <div className={styles.pageHeader}>
        <div>
          <h2>團隊管理儀表板</h2>
          <p className={styles.welcome}>歡迎回來，{user?.name}</p>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <h3>團隊Pipeline狀態</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dashboardData.pipelineStatus}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="初談" stackId="a" fill="#94a3b8" />
              <Bar dataKey="報價中" stackId="a" fill="#60a5fa" />
              <Bar dataKey="等客戶回覆" stackId="a" fill="#fbbf24" />
              <Bar dataKey="確認簽約" stackId="a" fill="#34d399" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <h3>轉換漏斗分析</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dashboardData.conversionFunnel} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="stage" type="category" />
              <Tooltip />
              <Bar dataKey="count" fill="#8884d8">
                <LabelList dataKey="rate" position="right" formatter={(value) => `${value}%`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {dashboardData.estimatedRevenue && (
        <div className={styles.revenueEstimate}>
          <h3>預估業績（依成功機率加權）</h3>
          <div className={styles.estimateGrid}>
            {Object.entries(dashboardData.estimatedRevenue).map(([stage, amount]) => (
              <div key={stage} className={styles.estimateCard}>
                <p className={styles.estimateStage}>{stage}</p>
                <p className={styles.estimateAmount}>
                  NT$ {amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderSalesDashboard = () => (
    <div className={styles.dashboard}>
      <div className={styles.pageHeader}>
        <div>
          <h2>我的業績儀表板</h2>
          <p className={styles.welcome}>歡迎回來，{user?.name}</p>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#10b981' }}>
            💼
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>我的業績</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.myRevenue?.toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#3b82f6' }}>
            🎯
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>洽談中金額</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.myPipeline?.toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#f59e0b' }}>
            💰
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>已收分潤</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.myCommissions?.toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#ef4444' }}>
            ⏳
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>待收分潤</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.pendingCommissions?.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <h3>分潤預測（未來3個月）</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dashboardData.commissionForecast}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `NT$ ${value.toLocaleString()}`} />
              <Legend />
              <Line type="monotone" dataKey="actual" stroke="#8884d8" name="實際分潤" />
              <Line type="monotone" dataKey="estimated" stroke="#82ca9d" name="預估分潤" strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {dashboardData.pendingActions?.length > 0 && (
        <div className={styles.actionsSection}>
          <h3>待辦事項</h3>
          <div className={styles.actionsList}>
            {dashboardData.pendingActions.map((action, index) => (
              <div key={index} className={`${styles.actionItem} ${styles[action.priority]}`}>
                <div className={styles.actionIcon}>
                  {action.type === 'pending_commission' ? '💵' : '📞'}
                </div>
                <div className={styles.actionContent}>
                  <p className={styles.actionTitle}>{action.title}</p>
                  {action.description && (
                    <p className={styles.actionDesc}>{action.description}</p>
                  )}
                </div>
                {action.amount && (
                  <div className={styles.actionAmount}>
                    NT$ {action.amount.toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderFinanceDashboard = () => (
    <div className={styles.dashboard}>
      <div className={styles.pageHeader}>
        <div>
          <h2>財務管理儀表板</h2>
          <p className={styles.welcome}>歡迎回來，{user?.name}</p>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#10b981' }}>
            ✅
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>已收款</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.totalReceived?.toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#f59e0b' }}>
            ⏰
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>待收款</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.totalPending?.toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#ef4444' }}>
            ⚠️
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>逾期款項</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.totalOverdue?.toLocaleString()}
            </p>
          </div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#8b5cf6' }}>
            📊
          </div>
          <div className={styles.statContent}>
            <p className={styles.statLabel}>淨利潤</p>
            <p className={styles.statValue}>
              NT$ {dashboardData.overview.netProfit?.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className={styles.chartsGrid}>
        <div className={styles.chartCard}>
          <h3>月度收支分析</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dashboardData.monthlyFinance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `NT$ ${value.toLocaleString()}`} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#10b981" name="收入" strokeWidth={2} />
              <Line type="monotone" dataKey="cost" stroke="#ef4444" name="成本" strokeWidth={2} />
              <Line type="monotone" dataKey="profit" stroke="#3b82f6" name="利潤" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {dashboardData.overdueList?.length > 0 && (
        <div className={styles.overdueSection}>
          <h3>逾期收款清單</h3>
          <table className={styles.overdueTable}>
            <thead>
              <tr>
                <th>專案編號</th>
                <th>客戶名稱</th>
                <th>期數</th>
                <th>金額</th>
                <th>逾期天數</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.overdueList.map((item, index) => (
                <tr key={index}>
                  <td>{item.project?.project_code}</td>
                  <td>{item.project?.client_name}</td>
                  <td>第{item.installment_number}期</td>
                  <td>NT$ {item.amount.toLocaleString()}</td>
                  <td>
                    {Math.floor((Date.now() - new Date(item.due_date).getTime()) / (1000 * 60 * 60 * 24))}天
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderDefaultDashboard = () => (
    <div className={styles.dashboard}>
      <div className={styles.pageHeader}>
        <div>
          <h2>歡迎使用分潤管理系統</h2>
          <p className={styles.welcome}>歡迎回來，{user?.name || user?.email}</p>
        </div>
      </div>
      
      <div className={styles.quickLinks}>
        <h3>快速連結</h3>
        <div className={styles.linkGrid}>
          <button onClick={() => router.push('/')} className={styles.linkCard}>
            <span className={styles.linkIcon}>📋</span>
            <span>專案管理</span>
          </button>
          <button onClick={() => router.push('/prospects')} className={styles.linkCard}>
            <span className={styles.linkIcon}>🎯</span>
            <span>洽談管理</span>
          </button>
          <button onClick={() => router.push('/commissions')} className={styles.linkCard}>
            <span className={styles.linkIcon}>💰</span>
            <span>分潤管理</span>
          </button>
          <button onClick={() => router.push('/profile')} className={styles.linkCard}>
            <span className={styles.linkIcon}>👤</span>
            <span>個人資料</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <Layout>
        <div className={styles.loading}>載入中...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      {renderDashboard()}
    </Layout>
  );
}