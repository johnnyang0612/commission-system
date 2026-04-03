import { useEffect, useState } from 'react';
import { getLaborReceipts, generatePendingLaborReceipts } from '../utils/laborReceiptGenerator';
import { getCurrentUser, getCurrentUserRole } from '../utils/permissions';
import { generateLaborReceiptPDF, downloadLaborReceiptCSV } from '../utils/laborReceiptPDF';
import { supabase } from '../utils/supabaseClient';

export default function LaborReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: '',
    userId: ''
  });
  const [generating, setGenerating] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    initAndFetch();
  }, []);

  async function initAndFetch() {
    // 取得當前用戶資料以進行權限控制
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: userData } = await supabase
        .from('users')
        .select('id, name, email, role')
        .eq('id', authUser.id)
        .single();
      if (userData) {
        setCurrentUser(userData);
        // 業務角色只能看到自己的勞報單
        if (userData.role === 'sales') {
          const salesFilters = { ...filters, userId: userData.id };
          setFilters(salesFilters);
          await fetchLaborReceiptsWithFilters(salesFilters);
          return;
        }
      }
    }
    await fetchLaborReceipts();
  }

  async function fetchLaborReceiptsWithFilters(overrideFilters) {
    setLoading(true);
    try {
      const result = await getLaborReceipts(overrideFilters);
      if (result.success) {
        setReceipts(result.data);
      } else {
        console.error('獲取勞務報酬單失敗:', result.error);
      }
    } catch (error) {
      console.error('獲取勞務報酬單錯誤:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLaborReceipts() {
    setLoading(true);
    try {
      // 業務角色強制過濾自己的資料
      const effectiveFilters = (currentUser && currentUser.role === 'sales')
        ? { ...filters, userId: currentUser.id }
        : filters;
      const result = await getLaborReceipts(effectiveFilters);
      if (result.success) {
        setReceipts(result.data);
      } else {
        console.error('獲取勞務報酬單失敗:', result.error);
      }
    } catch (error) {
      console.error('獲取勞務報酬單錯誤:', error);
    } finally {
      setLoading(false);
    }
  }

  const getStatusLabel = (status) => {
    const labels = {
      'draft': '草稿',
      'issued': '已開立',
      'paid': '已支付'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      'draft': '#95a5a6',
      'issued': '#3498db',
      'paid': '#27ae60'
    };
    return colors[status] || '#95a5a6';
  };

  const handleBatchGenerate = async () => {
    setGenerating(true);
    try {
      // 使用數據庫函數進行批次生成
      const { data, error } = await supabase.rpc('batch_generate_labor_receipts');
      
      if (error) throw error;
      
      const result = data[0];
      if (result) {
        alert(`批次產生完成！\n成功: ${result.success_count} 筆\n失敗: ${result.error_count} 筆\n總計處理: ${result.total_processed} 筆`);
        
        if (result.error_count > 0 && result.errors) {
          console.error('產生錯誤:', result.errors);
        }
      } else {
        alert('批次產生完成！');
      }
      
      // 重新載入資料
      await fetchLaborReceipts();
    } catch (error) {
      console.error('批次產生錯誤:', error);
      alert(`批次產生失敗: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
          載入中...
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ margin: 0 }}>勞務報酬單管理</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={handleBatchGenerate}
            disabled={generating}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: generating ? '#95a5a6' : '#f39c12',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: generating ? 'not-allowed' : 'pointer',
              fontSize: '1rem'
            }}
          >
            {generating ? '⏳ 產生中...' : '🔄 批次產生'}
          </button>
          <button
            onClick={() => downloadLaborReceiptCSV(receipts)}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            📥 匯出全部 (CSV)
          </button>
        </div>
      </div>

      {/* 篩選區域 */}
      <div style={{ 
        backgroundColor: '#f8f9fa', 
        padding: '1.5rem', 
        borderRadius: '8px', 
        marginBottom: '2rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>狀態</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({...filters, status: e.target.value})}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          >
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="issued">已開立</option>
            <option value="paid">已支付</option>
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>開始日期</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>結束日期</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <button
            onClick={fetchLaborReceipts}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            搜尋
          </button>
        </div>
      </div>

      {/* 統計資訊 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{ backgroundColor: '#e8f5e9', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#27ae60' }}>
            {receipts.length}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>總勞務報酬單</div>
        </div>
        
        <div style={{ backgroundColor: '#e3f2fd', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3498db' }}>
            NT$ {receipts.reduce((sum, r) => sum + (r.gross_amount || 0), 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>總分潤金額</div>
        </div>
        
        <div style={{ backgroundColor: '#fff3cd', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f39c12' }}>
            NT$ {receipts.reduce((sum, r) => sum + (r.tax_amount || 0), 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>總扣繳稅額</div>
        </div>
        
        <div style={{ backgroundColor: '#f8d7da', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc3545' }}>
            NT$ {receipts.reduce((sum, r) => sum + (r.insurance_amount || 0), 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>總健保費</div>
        </div>
      </div>

      {/* 勞務報酬單列表 */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>單號</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>開立日期</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>專案</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #dee2e6' }}>受領人</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>總額</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>扣繳稅</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>健保費</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', borderBottom: '2px solid #dee2e6' }}>實發金額</th>
              <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>狀態</th>
              <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '2px solid #dee2e6' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map(receipt => (
              <tr key={receipt.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                <td style={{ padding: '0.75rem', fontWeight: 'bold', color: '#2c3e50' }}>
                  {receipt.receipt_number}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  {new Date(receipt.receipt_date).toLocaleDateString('zh-TW')}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <div style={{ fontWeight: 'bold' }}>{receipt.project_code}</div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>{receipt.client_name}</div>
                </td>
                <td style={{ padding: '0.75rem' }}>
                  {receipt.recipient_name}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold' }}>
                  NT$ {(receipt.gross_amount || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#e74c3c' }}>
                  NT$ {(receipt.tax_amount || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: '#f39c12' }}>
                  NT$ {(receipt.insurance_amount || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: '#27ae60' }}>
                  NT$ {(receipt.net_amount || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '12px',
                    backgroundColor: getStatusColor(receipt.status),
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}>
                    {getStatusLabel(receipt.status)}
                  </span>
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <button
                    onClick={() => generateLaborReceiptPDF({
                      ...receipt,
                      // 從關聯的 user 帶入資料（如果勞報單本身沒有）
                      recipient_name: receipt.recipient_name || receipt.user?.name,
                      recipient_id: receipt.recipient_id || receipt.user?.national_id,
                      recipient_address: receipt.recipient_address || receipt.user?.mailing_address,
                      recipient_phone: receipt.recipient_phone || receipt.user?.mobile_number,
                      bank_name: receipt.bank_name || receipt.user?.bank_name,
                      bank_code: receipt.bank_code || receipt.user?.bank_code,
                      account_number: receipt.account_number || receipt.user?.account_number,
                      account_name: receipt.account_name || receipt.user?.account_name
                    })}
                    style={{
                      padding: '0.4rem 0.8rem',
                      backgroundColor: '#3498db',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      marginRight: '0.5rem'
                    }}
                    title="列印勞務報酬單"
                  >
                    🖨️ 列印
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {receipts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6c757d' }}>
            暫無勞務報酬單
          </div>
        )}
      </div>
    </div>
  );
}