// 勞務報酬單列印和下載工具

// 使用 HTML 方式生成列印版本
export function generateLaborReceiptPDF(receiptData) {
  const { 
    receipt_number,
    receipt_date,
    project_name,
    project_code,
    client_name,
    recipient_name,
    recipient_id,
    recipient_address,
    gross_amount,
    tax_amount,
    insurance_amount,
    net_amount,
    period_start,
    period_end
  } = receiptData;

  // 創建 HTML 內容
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
        .receipt-no { font-size: 14px; color: #666; }
        .info-section { margin-bottom: 20px; }
        .info-row { display: flex; margin-bottom: 10px; }
        .info-label { font-weight: bold; width: 120px; }
        .info-value { flex: 1; }
        .amount-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .amount-table th, .amount-table td { 
          border: 1px solid #ddd; 
          padding: 10px; 
          text-align: right; 
        }
        .amount-table th { background-color: #f5f5f5; text-align: left; }
        .total-row { font-weight: bold; background-color: #f9f9f9; }
        .signature { margin-top: 50px; display: flex; justify-content: space-between; }
        .signature-box { width: 200px; text-align: center; }
        .signature-line { border-bottom: 1px solid #000; margin-bottom: 5px; height: 40px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">勞務報酬單</div>
        <div class="receipt-no">單號：${receipt_number}</div>
      </div>
      
      <div class="info-section">
        <div class="info-row">
          <span class="info-label">開立日期：</span>
          <span class="info-value">${receipt_date}</span>
        </div>
        <div class="info-row">
          <span class="info-label">勞務期間：</span>
          <span class="info-value">${period_start} 至 ${period_end}</span>
        </div>
        <div class="info-row">
          <span class="info-label">專案名稱：</span>
          <span class="info-value">${project_name} (${project_code})</span>
        </div>
        <div class="info-row">
          <span class="info-label">委託單位：</span>
          <span class="info-value">${client_name}</span>
        </div>
      </div>
      
      <div class="info-section">
        <div class="info-row">
          <span class="info-label">受領人姓名：</span>
          <span class="info-value">${recipient_name}</span>
        </div>
        <div class="info-row">
          <span class="info-label">身分證字號：</span>
          <span class="info-value">${recipient_id || '未提供'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">地址：</span>
          <span class="info-value">${recipient_address || '未提供'}</span>
        </div>
      </div>
      
      <table class="amount-table">
        <tr>
          <th>項目</th>
          <th>金額 (NT$)</th>
        </tr>
        <tr>
          <td style="text-align: left;">勞務報酬總額</td>
          <td>${gross_amount.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="text-align: left;">扣繳稅額 (10%)</td>
          <td>-${tax_amount.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="text-align: left;">二代健保補充保費 (2.11%)</td>
          <td>-${insurance_amount.toLocaleString()}</td>
        </tr>
        <tr class="total-row">
          <td style="text-align: left;">實發金額</td>
          <td>${net_amount.toLocaleString()}</td>
        </tr>
      </table>
      
      <div class="signature">
        <div class="signature-box">
          <div class="signature-line"></div>
          <div>受領人簽章</div>
        </div>
        <div class="signature-box">
          <div class="signature-line"></div>
          <div>主管簽章</div>
        </div>
      </div>
    </body>
    </html>
  `;

  // 開啟新視窗並列印
  const printWindow = window.open('', '_blank');
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  
  // 等待內容載入後自動開啟列印對話框
  printWindow.onload = function() {
    printWindow.print();
  };
  
  return printWindow;
}

// 簡單下載功能（CSV格式）
export function downloadLaborReceiptCSV(receipts) {
  const headers = [
    '單號', '開立日期', '專案編號', '專案名稱', '客戶名稱',
    '受領人', '總額', '扣繳稅額', '健保費', '實發金額', '狀態'
  ];
  
  const rows = receipts.map(r => [
    r.receipt_number,
    r.receipt_date,
    r.project_code,
    r.project_name,
    r.client_name,
    r.recipient_name,
    r.gross_amount,
    r.tax_amount,
    r.insurance_amount,
    r.net_amount,
    r.status
  ]);
  
  // 建立 CSV 內容
  let csvContent = '\uFEFF'; // BOM for UTF-8
  csvContent += headers.join(',') + '\n';
  rows.forEach(row => {
    csvContent += row.map(cell => `"${cell || ''}"`).join(',') + '\n';
  });
  
  // 下載檔案
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `勞務報酬單_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}