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
    recipient_phone,
    bank_name,
    bank_code,
    account_number,
    account_name,
    gross_amount,
    tax_amount,
    insurance_amount,
    net_amount,
    period_start,
    period_end
  } = receiptData;

  // 空白欄位顯示底線（讓對方手寫）
  const blank = (value, width = 150) =>
    value ? value : `<span style="display: inline-block; width: ${width}px; border-bottom: 1px solid #000;">&nbsp;</span>`;

  // 創建 HTML 內容
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: "Microsoft JhengHei", Arial, sans-serif; padding: 20px; font-size: 14px; }
        .header { text-align: center; margin-bottom: 25px; }
        .title { font-size: 24px; font-weight: bold; margin-bottom: 8px; }
        .receipt-no { font-size: 13px; color: #666; }
        .section-title { font-weight: bold; background: #f5f5f5; padding: 6px 10px; margin: 15px 0 10px 0; border-left: 3px solid #333; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; margin-bottom: 15px; }
        .info-row { display: flex; align-items: center; }
        .info-label { font-weight: bold; min-width: 100px; color: #333; }
        .info-value { flex: 1; }
        .amount-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .amount-table th, .amount-table td {
          border: 1px solid #ddd;
          padding: 10px;
          text-align: right;
        }
        .amount-table th { background-color: #f5f5f5; text-align: left; }
        .total-row { font-weight: bold; background-color: #e8f5e9; }
        .signature { margin-top: 40px; display: flex; justify-content: space-around; }
        .signature-box { width: 180px; text-align: center; }
        .signature-line { border-bottom: 1px solid #000; margin-bottom: 5px; height: 50px; }
        .note { margin-top: 20px; padding: 10px; background: #fff9e6; border: 1px solid #ffd700; border-radius: 4px; font-size: 12px; color: #666; }
        @media print {
          body { padding: 10px; }
          .note { background: #fff; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">勞務報酬單</div>
        <div class="receipt-no">單號：${receipt_number || '（系統產生）'}</div>
      </div>

      <div class="section-title">專案資訊</div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">開立日期：</span>
          <span class="info-value">${receipt_date || new Date().toLocaleDateString('zh-TW')}</span>
        </div>
        <div class="info-row">
          <span class="info-label">勞務期間：</span>
          <span class="info-value">${period_start || ''} 至 ${period_end || ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">專案名稱：</span>
          <span class="info-value">${project_name || ''} ${project_code ? `(${project_code})` : ''}</span>
        </div>
        <div class="info-row">
          <span class="info-label">委託單位：</span>
          <span class="info-value">${client_name || ''}</span>
        </div>
      </div>

      <div class="section-title">受領人資料（請填寫完整）</div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">姓名：</span>
          <span class="info-value">${blank(recipient_name, 120)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">身分證字號：</span>
          <span class="info-value">${blank(recipient_id, 120)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">聯絡電話：</span>
          <span class="info-value">${blank(recipient_phone, 120)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">通訊地址：</span>
          <span class="info-value">${blank(recipient_address, 200)}</span>
        </div>
      </div>

      <div class="section-title">匯款帳戶資訊（請填寫完整）</div>
      <div class="info-grid">
        <div class="info-row">
          <span class="info-label">銀行名稱：</span>
          <span class="info-value">${blank(bank_name, 120)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">銀行代碼：</span>
          <span class="info-value">${blank(bank_code, 80)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">帳號：</span>
          <span class="info-value">${blank(account_number, 150)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">戶名：</span>
          <span class="info-value">${blank(account_name, 120)}</span>
        </div>
      </div>

      <div class="section-title">報酬明細</div>
      <table class="amount-table">
        <tr>
          <th>項目</th>
          <th>金額 (NT$)</th>
        </tr>
        <tr>
          <td style="text-align: left;">勞務報酬總額</td>
          <td>${(gross_amount || 0).toLocaleString()}</td>
        </tr>
        <tr>
          <td style="text-align: left;">扣繳稅額 (10%)</td>
          <td>-${(tax_amount || 0).toLocaleString()}</td>
        </tr>
        <tr>
          <td style="text-align: left;">二代健保補充保費 (2.11%)</td>
          <td>-${(insurance_amount || 0).toLocaleString()}</td>
        </tr>
        <tr class="total-row">
          <td style="text-align: left;">實發金額</td>
          <td>${(net_amount || 0).toLocaleString()}</td>
        </tr>
      </table>

      <div class="note">
        ※ 請受領人確認上述資料無誤後簽章，如有空白欄位請填寫完整後回傳。<br>
        ※ 本單據作為勞務報酬支付憑證，請妥善保管。
      </div>

      <div class="signature">
        <div class="signature-box">
          <div class="signature-line"></div>
          <div>受領人簽章</div>
        </div>
        <div class="signature-box">
          <div class="signature-line"></div>
          <div>經辦人</div>
        </div>
        <div class="signature-box">
          <div class="signature-line"></div>
          <div>主管核准</div>
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