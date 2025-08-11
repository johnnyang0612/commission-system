import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';
import Layout from '../components/Layout';

export default function MaintenanceManagement() {
  const { user } = useSimpleAuth();
  const [maintenanceCashflows, setMaintenanceCashflows] = useState([]);
  const [maintenanceBills, setMaintenanceBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('cashflows');
  const [renewalAlerts, setRenewalAlerts] = useState([]);

  useEffect(() => {
    if (user) {
      fetchMaintenanceData();
    }
  }, [user]);

  async function fetchMaintenanceData() {
    setLoading(true);
    try {
      // 獲取維護費現金流
      const { data: cashflows, error: cashflowError } = await supabase
        .from('maintenance_cashflow')
        .select(`
          *,
          projects (
            project_name,
            client_name,
            project_code
          )
        `)
        .order('next_billing_date', { ascending: true });

      if (cashflowError) throw cashflowError;
      setMaintenanceCashflows(cashflows || []);

      // 獲取維護費帳單
      const { data: bills, error: billsError } = await supabase
        .from('maintenance_bills')
        .select(`
          *,
          projects (
            project_name,
            client_name,
            project_code
          )
        `)
        .order('due_date', { ascending: false });

      if (billsError) throw billsError;
      setMaintenanceBills(bills || []);
      
      // 檢查續約提醒
      if (cashflows && cashflows.length > 0) {
        checkRenewalAlerts(cashflows);
      }
    } catch (error) {
      console.error('獲取維護費資料失敗:', error);
      alert('載入資料失敗: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateNextBills() {
    try {
      const today = new Date().toISOString().split('T')[0];
      let generatedCount = 0;

      for (const cashflow of maintenanceCashflows) {
        if (cashflow.status !== 'active' || cashflow.next_billing_date > today) continue;

        // 創建新帳單
        const { error: billError } = await supabase
          .from('maintenance_bills')
          .insert({
            maintenance_cashflow_id: cashflow.id,
            project_id: cashflow.project_id,
            billing_date: today,
            due_date: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0],
            amount: cashflow.maintenance_fee,
            status: 'pending'
          });

        if (billError) {
          console.error('創建帳單失敗:', billError);
          continue;
        }

        // 更新下次帳單日期
        const nextDate = new Date(cashflow.next_billing_date);
        nextDate.setMonth(nextDate.getMonth() + 1);
        
        const { error: updateError } = await supabase
          .from('maintenance_cashflow')
          .update({
            next_billing_date: nextDate.toISOString().split('T')[0]
          })
          .eq('id', cashflow.id);

        if (updateError) {
          console.error('更新下次帳單日期失敗:', updateError);
        }

        generatedCount++;
      }

      alert(`成功生成 ${generatedCount} 筆維護費帳單`);
      fetchMaintenanceData();
    } catch (error) {
      console.error('生成帳單失敗:', error);
      alert('生成帳單失敗: ' + error.message);
    }
  }

  async function updateBillStatus(billId, status, paymentDate = null, actualAmount = null) {
    try {
      const updateData = { status };
      if (status === 'paid') {
        updateData.payment_date = paymentDate;
        updateData.actual_amount = actualAmount;
      }

      const { error } = await supabase
        .from('maintenance_bills')
        .update(updateData)
        .eq('id', billId);

      if (error) throw error;

      alert('帳單狀態更新成功');
      fetchMaintenanceData();
    } catch (error) {
      console.error('更新帳單狀態失敗:', error);
      alert('更新失敗: ' + error.message);
    }
  }
  
  function checkRenewalAlerts(cashflows) {
    const today = new Date();
    const alerts = [];
    
    cashflows.forEach(cashflow => {
      if (cashflow.status !== 'active' || !cashflow.end_date) return;
      
      const endDate = new Date(cashflow.end_date);
      const daysDiff = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
      
      let alertLevel = null;
      let message = '';
      
      if (daysDiff <= 14 && daysDiff > 0) {
        alertLevel = 'critical';
        message = `緊急！需立即簽約續約（${daysDiff}天後結束）`;
      } else if (daysDiff <= 60 && daysDiff > 14) {
        alertLevel = 'warning';
        message = `請準備續約作業（${daysDiff}天後結束）`;
      } else if (daysDiff <= 0) {
        alertLevel = 'expired';
        message = `維護合約已結束（${Math.abs(daysDiff)}天前）`;
      }
      
      if (alertLevel) {
        alerts.push({
          id: cashflow.id,
          project_name: cashflow.projects?.project_name,
          client_name: cashflow.projects?.client_name,
          end_date: cashflow.end_date,
          days_remaining: daysDiff,
          level: alertLevel,
          message
        });
      }
    });
    
    setRenewalAlerts(alerts);
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#27ae60';
      case 'paused': return '#f39c12';
      case 'terminated': return '#e74c3c';
      case 'paid': return '#27ae60';
      case 'pending': return '#f39c12';
      case 'overdue': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active': return '進行中';
      case 'paused': return '暫停';
      case 'terminated': return '已終止';
      case 'paid': return '已付款';
      case 'pending': return '待付款';
      case 'overdue': return '逾期';
      default: return status;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ padding: '2rem' }}>

      {/* 續約提醒區塊 */}
      {renewalAlerts.length > 0 && (
        <div style={{
          backgroundColor: '#fff3cd',
          border: '1px solid #ffeaa7',
          borderRadius: '8px',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{ 
            margin: '0 0 1rem 0', 
            color: '#856404',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            🔔 續約提醒 ({renewalAlerts.length} 項)
          </h3>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {renewalAlerts.map(alert => (
              <div key={alert.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                backgroundColor: 'white',
                borderRadius: '6px',
                border: `2px solid ${
                  alert.level === 'expired' ? '#e74c3c' : 
                  alert.level === 'critical' ? '#e67e22' : '#f39c12'
                }`
              }}>
                <div>
                  <strong style={{ color: '#2c3e50' }}>
                    {alert.project_name} ({alert.client_name})
                  </strong>
                  <div style={{ 
                    fontSize: '0.9rem', 
                    color: alert.level === 'expired' ? '#e74c3c' : '#666',
                    marginTop: '0.25rem'
                  }}>
                    {alert.message}
                  </div>
                </div>
                <div style={{ 
                  fontSize: '0.8rem', 
                  color: '#666',
                  textAlign: 'right'
                }}>
                  合約到期: {alert.end_date}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 統計卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3 style={{ color: '#27ae60', margin: '0 0 0.5rem 0' }}>進行中合約</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, color: '#2c3e50' }}>
            {maintenanceCashflows.filter(c => c.status === 'active').length}
          </p>
        </div>
        
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3 style={{ color: '#3498db', margin: '0 0 0.5rem 0' }}>月收入</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, color: '#2c3e50' }}>
            NT$ {maintenanceCashflows
              .filter(c => c.status === 'active')
              .reduce((sum, c) => sum + (c.maintenance_fee || 0), 0)
              .toLocaleString()}
          </p>
        </div>
        
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <h3 style={{ color: '#f39c12', margin: '0 0 0.5rem 0' }}>待收帳單</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0, color: '#2c3e50' }}>
            {maintenanceBills.filter(b => b.status === 'pending').length}
          </p>
        </div>
      </div>

      {/* 操作按鈕和說明 */}
      <div style={{ 
        backgroundColor: '#e8f5e8',
        border: '1px solid #27ae60',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <h4 style={{ margin: '0 0 1rem 0', color: '#27ae60' }}>💡 如何使用維護管理系統</h4>
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.9rem', color: '#2c3e50' }}>
          <div>1. 📋 在各專案詳情頁填寫「保固與維護資訊」</div>
          <div>2. 🔄 系統會自動生成維護合約和現金流預測</div>
          <div>3. 📅 每月點擊「生成本月帳單」建立維護費帳單</div>
          <div>4. 💰 收到款項後更新帳單狀態為「已付款」</div>
          <div>5. 🔔 系統會在合約到期前 2 個月和 2 週自動提醒</div>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={generateNextBills}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            📅 生成本月帳單
          </button>
          
          <button
            onClick={fetchMaintenanceData}
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
            🔄 重新整理
          </button>
        </div>
      </div>

      {/* 分頁標籤 */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => setActiveTab('cashflows')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: activeTab === 'cashflows' ? '#3498db' : '#ecf0f1',
            color: activeTab === 'cashflows' ? 'white' : '#2c3e50',
            border: 'none',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            marginRight: '0.25rem'
          }}
        >
          維護合約
        </button>
        <button
          onClick={() => setActiveTab('bills')}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: activeTab === 'bills' ? '#3498db' : '#ecf0f1',
            color: activeTab === 'bills' ? 'white' : '#2c3e50',
            border: 'none',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer'
          }}
        >
          維護帳單
        </button>
      </div>

      {/* 維護合約列表 */}
      {activeTab === 'cashflows' && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '1rem', textAlign: 'left' }}>專案</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>客戶</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>月費</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>開始日期</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>下次計費</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>狀態</th>
              </tr>
            </thead>
            <tbody>
              {maintenanceCashflows.map(cashflow => (
                <tr key={cashflow.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{cashflow.projects?.project_name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {cashflow.projects?.project_code}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>{cashflow.projects?.client_name}</td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>
                    NT$ {cashflow.maintenance_fee?.toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>{cashflow.start_date}</td>
                  <td style={{ padding: '1rem' }}>{cashflow.next_billing_date}</td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      backgroundColor: getStatusColor(cashflow.status),
                      color: 'white'
                    }}>
                      {getStatusText(cashflow.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {maintenanceCashflows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
              暫無維護合約
            </div>
          )}
        </div>
      )}

      {/* 維護帳單列表 */}
      {activeTab === 'bills' && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '1rem', textAlign: 'left' }}>專案</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>客戶</th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>金額</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>計費日期</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>到期日</th>
                <th style={{ padding: '1rem', textAlign: 'left' }}>付款日</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>狀態</th>
                <th style={{ padding: '1rem', textAlign: 'center' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {maintenanceBills.map(bill => (
                <tr key={bill.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{bill.projects?.project_name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {bill.projects?.project_code}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>{bill.projects?.client_name}</td>
                  <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>
                    NT$ {bill.amount?.toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>{bill.billing_date}</td>
                  <td style={{ padding: '1rem' }}>{bill.due_date}</td>
                  <td style={{ padding: '1rem' }}>{bill.payment_date || '-'}</td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '12px',
                      fontSize: '0.85rem',
                      backgroundColor: getStatusColor(bill.status),
                      color: 'white'
                    }}>
                      {getStatusText(bill.status)}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {bill.status === 'pending' && (
                      <button
                        onClick={() => {
                          const paymentDate = prompt('請輸入付款日期 (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
                          if (paymentDate) {
                            const actualAmount = prompt('請輸入實際付款金額:', bill.amount);
                            if (actualAmount) {
                              updateBillStatus(bill.id, 'paid', paymentDate, parseFloat(actualAmount));
                            }
                          }
                        }}
                        style={{
                          padding: '0.25rem 0.75rem',
                          backgroundColor: '#27ae60',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem'
                        }}
                      >
                        標記已付款
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {maintenanceBills.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
              暫無維護帳單
            </div>
          )}
        </div>
      )}
      </div>
    </Layout>
  );
}