import { useEffect, useState } from 'react';
import { getLaborReceipts } from '../utils/laborReceiptGenerator';
import { getCurrentUser, getCurrentUserRole } from '../utils/permissions';
import { generateLaborReceiptPDF, downloadLaborReceiptCSV } from '../utils/laborReceiptPDF';

export default function LaborReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    dateFrom: '',
    dateTo: '',
    userId: ''
  });

  useEffect(() => {
    fetchLaborReceipts();
  }, []);

  async function fetchLaborReceipts() {
    setLoading(true);
    try {
      const result = await getLaborReceipts(filters);
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
                    onClick={() => generateLaborReceiptPDF(receipt)}
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