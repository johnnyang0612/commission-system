import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useSimpleAuth } from '../utils/simpleAuth';

const WORKFLOW_STATUS = {
  pending: { label: '待產生', color: '#6b7280', icon: '⏳' },
  pending_signature: { label: '待簽收', color: '#f59e0b', icon: '📝' },
  downloaded: { label: '已下載', color: '#3b82f6', icon: '📥' },
  signed: { label: '已簽名', color: '#8b5cf6', icon: '✍️' },
  approved: { label: '已審核', color: '#10b981', icon: '✅' },
  rejected: { label: '已駁回', color: '#ef4444', icon: '❌' }
};

export default function PayoutManagement() {
  const { user, loading: authLoading } = useSimpleAuth();
  const [activeTab, setActiveTab] = useState('create'); // create, pending, history
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  // 新增撥款表單
  const [formData, setFormData] = useState({
    project_id: '',
    user_id: '',
    amount: '',
    notes: ''
  });
  const [selectedProject, setSelectedProject] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      fetchProjects();
      fetchUsers();
      fetchPayouts();
    }
  }, [authLoading, user]);

  async function fetchProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id, project_code, client_name, project_name, amount, status,
          commissions:commissions(id, user_id, amount, status, users:user_id(name))
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('取得專案錯誤:', error);
    }
  }

  async function fetchUsers() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, roles')
        .order('name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('取得用戶錯誤:', error);
    }
  }

  async function fetchPayouts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('labor_receipts')
        .select(`
          *,
          projects:project_id(project_code, client_name),
          users:user_id(name, email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPayouts(data || []);
    } catch (error) {
      console.error('取得撥款記錄錯誤:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePayout(e) {
    e.preventDefault();
    if (!formData.project_id || !formData.user_id || !formData.amount) {
      alert('請填寫所有必填欄位');
      return;
    }

    setSubmitting(true);
    try {
      const amount = parseFloat(formData.amount);
      const taxAmount = amount * 0.1;
      const insuranceAmount = amount * 0.0211;
      const netAmount = amount - taxAmount - insuranceAmount;

      // 產生勞報單編號
      const receiptNumber = `LR-${Date.now()}`;

      // 建立勞報單
      const { data: receipt, error: receiptError } = await supabase
        .from('labor_receipts')
        .insert({
          project_id: formData.project_id,
          user_id: formData.user_id,
          receipt_number: receiptNumber,
          receipt_date: new Date().toISOString().split('T')[0],
          gross_amount: amount,
          tax_amount: taxAmount,
          insurance_amount: insuranceAmount,
          net_amount: netAmount,
          status: 'issued',
          workflow_status: 'pending_signature',
          notes: formData.notes
        })
        .select()
        .single();

      if (receiptError) throw receiptError;

      // 建立撥款記錄
      const { error: payoutError } = await supabase
        .from('commission_payouts')
        .insert({
          project_id: formData.project_id,
          user_id: formData.user_id,
          payout_amount: amount,
          payout_date: new Date().toISOString().split('T')[0],
          labor_receipt_id: receipt.id,
          status: 'pending',
          is_approved: false
        });

      if (payoutError) throw payoutError;

      // 建立通知
      await supabase
        .from('payout_notifications')
        .insert({
          labor_receipt_id: receipt.id,
          user_id: formData.user_id,
          notification_type: 'pending_signature'
        });

      alert('撥款建立成功！勞報單已產生，等待員工簽收。');
      setFormData({ project_id: '', user_id: '', amount: '', notes: '' });
      setSelectedProject(null);
      fetchPayouts();
      setActiveTab('pending');

    } catch (error) {
      console.error('建立撥款錯誤:', error);
      alert('建立失敗: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(receiptId) {
    if (!confirm('確定審核通過此筆撥款？通過後將計入專案成本。')) return;

    try {
      // 更新勞報單狀態
      const { error: receiptError } = await supabase
        .from('labor_receipts')
        .update({
          workflow_status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: user.id
        })
        .eq('id', receiptId);

      if (receiptError) throw receiptError;

      // 更新撥款記錄
      await supabase
        .from('commission_payouts')
        .update({
          is_approved: true,
          approved_at: new Date().toISOString(),
          approved_by: user.id,
          counted_in_cost: true,
          status: 'paid'
        })
        .eq('labor_receipt_id', receiptId);

      alert('審核通過！已計入專案成本。');
      fetchPayouts();
    } catch (error) {
      console.error('審核錯誤:', error);
      alert('審核失敗: ' + error.message);
    }
  }

  async function handleReject(receiptId) {
    const reason = prompt('請輸入駁回原因:');
    if (!reason) return;

    try {
      await supabase
        .from('labor_receipts')
        .update({
          workflow_status: 'rejected',
          rejection_reason: reason
        })
        .eq('id', receiptId);

      alert('已駁回');
      fetchPayouts();
    } catch (error) {
      console.error('駁回錯誤:', error);
      alert('駁回失敗: ' + error.message);
    }
  }

  function formatCurrency(amount) {
    return `NT$ ${(amount || 0).toLocaleString()}`;
  }

  function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('zh-TW');
  }

  // 統計
  const pendingCount = payouts.filter(p => p.workflow_status === 'pending_signature' || p.workflow_status === 'downloaded').length;
  const signedCount = payouts.filter(p => p.workflow_status === 'signed').length;
  const approvedCount = payouts.filter(p => p.workflow_status === 'approved').length;

  if (authLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>載入中...</div>;
  }

  // 權限檢查
  const canManage = user?.role === 'admin' || user?.role === 'finance';
  if (!canManage) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>權限不足</h2>
        <p>此頁面僅限管理員和財務人員使用</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0' }}>
      {/* 頁面標題 */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>💰 分潤撥款管理</h1>
        <p style={{ margin: '0.5rem 0 0', color: '#666', fontSize: '0.9rem' }}>
          建立撥款、產生勞報單、審核簽收
        </p>
      </div>

      {/* 統計卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ backgroundColor: '#fef3c7', padding: '1rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{pendingCount}</div>
          <div style={{ color: '#92400e' }}>待簽收</div>
        </div>
        <div style={{ backgroundColor: '#ddd6fe', padding: '1rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{signedCount}</div>
          <div style={{ color: '#5b21b6' }}>待審核</div>
        </div>
        <div style={{ backgroundColor: '#d1fae5', padding: '1rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{approvedCount}</div>
          <div style={{ color: '#065f46' }}>已完成</div>
        </div>
        <div style={{ backgroundColor: '#e0e7ff', padding: '1rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{payouts.length}</div>
          <div style={{ color: '#3730a3' }}>總筆數</div>
        </div>
      </div>

      {/* Tab 切換 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>
        {[
          { key: 'create', label: '➕ 新增撥款' },
          { key: 'pending', label: `📝 待處理 (${pendingCount + signedCount})` },
          { key: 'history', label: '📋 歷史記錄' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: activeTab === tab.key ? '#3b82f6' : 'transparent',
              color: activeTab === tab.key ? 'white' : '#374151',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? '600' : '400'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 新增撥款表單 */}
      {activeTab === 'create' && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ margin: '0 0 1.5rem' }}>新增分潤撥款</h3>

          <form onSubmit={handleCreatePayout}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* 選擇專案 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>選擇專案 *</label>
                <select
                  value={formData.project_id}
                  onChange={(e) => {
                    const proj = projects.find(p => p.id === e.target.value);
                    setFormData({ ...formData, project_id: e.target.value });
                    setSelectedProject(proj);
                  }}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
                  required
                >
                  <option value="">-- 請選擇專案 --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.project_code} - {p.client_name} ({formatCurrency(p.amount)})
                    </option>
                  ))}
                </select>
              </div>

              {/* 選擇人員 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>撥款對象 *</label>
                <select
                  value={formData.user_id}
                  onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
                  required
                >
                  <option value="">-- 請選擇人員 --</option>
                  {users.filter(u => ['sales', 'pm', 'leader'].some(r => u.roles?.includes(r) || u.role === r)).map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.roles?.join('+') || u.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* 金額 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>撥款金額 (毛額) *</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="輸入金額"
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
                  required
                  min="1"
                />
              </div>

              {/* 備註 */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>備註</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="例如：第一期分潤"
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '8px' }}
                />
              </div>
            </div>

            {/* 金額預覽 */}
            {formData.amount && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 0.75rem', color: '#374151' }}>勞報單預覽</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', textAlign: 'center' }}>
                  <div>
                    <div style={{ color: '#666', fontSize: '0.85rem' }}>毛額</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{formatCurrency(parseFloat(formData.amount))}</div>
                  </div>
                  <div>
                    <div style={{ color: '#666', fontSize: '0.85rem' }}>扣繳稅 (10%)</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem', color: '#dc2626' }}>
                      -{formatCurrency(parseFloat(formData.amount) * 0.1)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#666', fontSize: '0.85rem' }}>健保 (2.11%)</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem', color: '#dc2626' }}>
                      -{formatCurrency(parseFloat(formData.amount) * 0.0211)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#666', fontSize: '0.85rem' }}>實發金額</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem', color: '#059669' }}>
                      {formatCurrency(parseFloat(formData.amount) * (1 - 0.1 - 0.0211))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem 2rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: submitting ? 'wait' : 'pointer',
                fontSize: '1rem',
                fontWeight: '500'
              }}
            >
              {submitting ? '處理中...' : '建立撥款並產生勞報單'}
            </button>
          </form>
        </div>
      )}

      {/* 待處理列表 */}
      {activeTab === 'pending' && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>單號</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>專案</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>受領人</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>金額</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>狀態</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>簽名文件</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {payouts
                .filter(p => ['pending_signature', 'downloaded', 'signed'].includes(p.workflow_status))
                .map(payout => {
                  const status = WORKFLOW_STATUS[payout.workflow_status] || WORKFLOW_STATUS.pending;
                  return (
                    <tr key={payout.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '1rem' }}>{payout.receipt_number}</td>
                      <td style={{ padding: '1rem' }}>
                        <div>{payout.projects?.project_code}</div>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>{payout.projects?.client_name}</div>
                      </td>
                      <td style={{ padding: '1rem' }}>{payout.users?.name}</td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>{formatCurrency(payout.gross_amount)}</td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '20px',
                          backgroundColor: status.color + '20',
                          color: status.color,
                          fontSize: '0.85rem'
                        }}>
                          {status.icon} {status.label}
                        </span>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        {payout.signed_document_url ? (
                          <a href={payout.signed_document_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: '#3b82f6' }}>
                            📄 查看
                          </a>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        {payout.workflow_status === 'signed' && (
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <button
                              onClick={() => handleApprove(payout.id)}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                              }}
                            >
                              ✅ 審核通過
                            </button>
                            <button
                              onClick={() => handleReject(payout.id)}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                              }}
                            >
                              ❌ 駁回
                            </button>
                          </div>
                        )}
                        {payout.workflow_status !== 'signed' && (
                          <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>等待簽收</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {payouts.filter(p => ['pending_signature', 'downloaded', 'signed'].includes(p.workflow_status)).length === 0 && (
                <tr>
                  <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                    沒有待處理的撥款
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 歷史記錄 */}
      {activeTab === 'history' && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>日期</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>單號</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>專案</th>
                <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>受領人</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>毛額</th>
                <th style={{ padding: '1rem', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>實發</th>
                <th style={{ padding: '1rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>狀態</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map(payout => {
                const status = WORKFLOW_STATUS[payout.workflow_status] || WORKFLOW_STATUS.pending;
                return (
                  <tr key={payout.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '1rem' }}>{formatDate(payout.receipt_date)}</td>
                    <td style={{ padding: '1rem' }}>{payout.receipt_number}</td>
                    <td style={{ padding: '1rem' }}>{payout.projects?.project_code}</td>
                    <td style={{ padding: '1rem' }}>{payout.users?.name}</td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>{formatCurrency(payout.gross_amount)}</td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>{formatCurrency(payout.net_amount)}</td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '20px',
                        backgroundColor: status.color + '20',
                        color: status.color,
                        fontSize: '0.85rem'
                      }}>
                        {status.icon} {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
