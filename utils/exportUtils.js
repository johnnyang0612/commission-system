import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';

// 自動調整欄寬
const autoFitColumns = (json, worksheet) => {
  const jsonKeys = Object.keys(json[0]);
  const objectMaxLength = [];
  
  jsonKeys.forEach((key) => {
    objectMaxLength.push(
      key.length,
      ...json.map((obj) => {
        const value = obj[key];
        return value ? value.toString().length : 0;
      })
    );
  });

  const wscols = jsonKeys.map((key, i) => ({
    wch: Math.max(...objectMaxLength.slice(
      i * (json.length + 1),
      (i + 1) * (json.length + 1)
    )) + 2
  }));

  worksheet['!cols'] = wscols;
};

// 匯出洽談案到Excel
export const exportProspectsToExcel = (prospects, filename = '洽談案清單') => {
  try {
    // 準備數據
    const exportData = prospects.map(p => ({
      '客戶名稱': p.client_name,
      '專案名稱': p.project_name,
      '預估金額': p.estimated_amount,
      '分潤比例(%)': p.commission_rate,
      '預估分潤': p.estimated_amount * p.commission_rate / 100,
      '負責人': p.owner?.name || '未指派',
      '洽談階段': p.stage,
      '預計簽約日': p.expected_sign_date ? new Date(p.expected_sign_date).toLocaleDateString('zh-TW') : '',
      '客戶來源': p.source || '',
      '備註': p.note || '',
      '建立日期': new Date(p.created_at).toLocaleDateString('zh-TW'),
      '最後更新': new Date(p.updated_at).toLocaleDateString('zh-TW')
    }));

    // 創建工作簿
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // 自動調整欄寬
    autoFitColumns(exportData, ws);
    
    // 添加工作表
    XLSX.utils.book_append_sheet(wb, ws, '洽談案');
    
    // 匯出檔案
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    return true;
  } catch (error) {
    console.error('Excel匯出失敗:', error);
    return false;
  }
};

// 匯出專案到Excel
export const exportProjectsToExcel = (projects, filename = '專案清單') => {
  try {
    const exportData = projects.map(p => ({
      '專案編號': p.project_code,
      '客戶名稱': p.client_name,
      '專案名稱': p.project_name || '',
      '合約金額': p.amount,
      '專案類型': p.type === 'new' ? '新簽' : p.type === 'renewal' ? '續簽' : '維護',
      '付款模式': p.payment_template === 'single' ? '一次付清' : 
                  p.payment_template === 'two_installments' ? '分兩期' :
                  p.payment_template === 'three_installments' ? '分三期' :
                  p.payment_template === 'four_installments' ? '分四期' : '自訂',
      '負責業務': p.assigned_user?.name || '',
      '建立日期': new Date(p.created_at).toLocaleDateString('zh-TW')
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    autoFitColumns(exportData, ws);
    XLSX.utils.book_append_sheet(wb, ws, '專案');
    
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    return true;
  } catch (error) {
    console.error('Excel匯出失敗:', error);
    return false;
  }
};

// 匯出洽談案統計報表到PDF
export const exportProspectReportToPDF = (statistics, prospects) => {
  try {
    const doc = new jsPDF();
    
    // 設定字體（使用內建字體，可能需要額外設定中文字體）
    doc.setFontSize(20);
    doc.text('洽談案統計報表', 105, 20, { align: 'center' });
    
    // 報表日期
    doc.setFontSize(12);
    doc.text(`報表日期: ${new Date().toLocaleDateString('zh-TW')}`, 20, 35);
    
    // 統計摘要
    doc.setFontSize(14);
    doc.text('統計摘要', 20, 50);
    doc.setFontSize(11);
    
    const summaryData = [
      `總洽談案數量: ${prospects.length}`,
      `Pipeline總價值: NT$ ${prospects
        .filter(p => !['已失單', '已轉換'].includes(p.stage))
        .reduce((sum, p) => sum + parseFloat(p.estimated_amount || 0), 0)
        .toLocaleString()}`,
      `預估總分潤: NT$ ${prospects
        .filter(p => !['已失單', '已轉換'].includes(p.stage))
        .reduce((sum, p) => sum + (parseFloat(p.estimated_amount || 0) * parseFloat(p.commission_rate || 0) / 100), 0)
        .toLocaleString()}`,
      `平均轉換天數: ${statistics?.avg_conversion_days || 'N/A'} 天`
    ];
    
    summaryData.forEach((text, index) => {
      doc.text(text, 25, 60 + (index * 7));
    });
    
    // 階段分布
    doc.setFontSize(14);
    doc.text('階段分布', 20, 95);
    doc.setFontSize(11);
    
    const stageData = [
      { stage: '初談', count: prospects.filter(p => p.stage === '初談').length },
      { stage: '報價中', count: prospects.filter(p => p.stage === '報價中').length },
      { stage: '等客戶回覆', count: prospects.filter(p => p.stage === '等客戶回覆').length },
      { stage: '確認簽約', count: prospects.filter(p => p.stage === '確認簽約').length },
      { stage: '已失單', count: prospects.filter(p => p.stage === '已失單').length },
      { stage: '已轉換', count: prospects.filter(p => p.stage === '已轉換').length }
    ];
    
    stageData.forEach((item, index) => {
      doc.text(`${item.stage}: ${item.count} 件`, 25, 105 + (index * 7));
    });
    
    // 儲存PDF
    doc.save(`洽談案報表_${new Date().toISOString().split('T')[0]}.pdf`);
    
    return true;
  } catch (error) {
    console.error('PDF匯出失敗:', error);
    return false;
  }
};

// 匯出財務報表到Excel
export const exportFinancialReportToExcel = (data, filename = '財務報表') => {
  try {
    const wb = XLSX.utils.book_new();
    
    // 收款明細
    if (data.payments && data.payments.length > 0) {
      const paymentData = data.payments.map(p => ({
        '專案編號': p.project?.project_code || '',
        '客戶名稱': p.project?.client_name || '',
        '期數': `第${p.installment_number}期`,
        '應收金額': p.amount,
        '收款狀態': p.status === 'paid' ? '已收款' : p.status === 'unpaid' ? '待收款' : '逾期',
        '收款日期': p.paid_date ? new Date(p.paid_date).toLocaleDateString('zh-TW') : '',
        '到期日': p.due_date ? new Date(p.due_date).toLocaleDateString('zh-TW') : ''
      }));
      
      const ws1 = XLSX.utils.json_to_sheet(paymentData);
      autoFitColumns(paymentData, ws1);
      XLSX.utils.book_append_sheet(wb, ws1, '收款明細');
    }
    
    // 成本明細
    if (data.costs && data.costs.length > 0) {
      const costData = data.costs.map(c => ({
        '專案編號': c.project?.project_code || '',
        '成本類型': c.cost_type,
        '金額': c.amount,
        '成本日期': new Date(c.cost_date).toLocaleDateString('zh-TW'),
        '付款狀態': c.is_paid ? '已付款' : '未付款',
        '備註': c.description || ''
      }));
      
      const ws2 = XLSX.utils.json_to_sheet(costData);
      autoFitColumns(costData, ws2);
      XLSX.utils.book_append_sheet(wb, ws2, '成本明細');
    }
    
    // 分潤明細
    if (data.commissions && data.commissions.length > 0) {
      const commissionData = data.commissions.map(c => ({
        '專案編號': c.project?.project_code || '',
        '客戶名稱': c.project?.client_name || '',
        '業務員': c.user?.name || '',
        '分潤比例(%)': c.percentage,
        '分潤金額': c.amount,
        '狀態': c.status === 'paid' ? '已撥款' : c.status === 'approved' ? '已核准' : '待審核',
        '撥款日期': c.paid_date ? new Date(c.paid_date).toLocaleDateString('zh-TW') : ''
      }));
      
      const ws3 = XLSX.utils.json_to_sheet(commissionData);
      autoFitColumns(commissionData, ws3);
      XLSX.utils.book_append_sheet(wb, ws3, '分潤明細');
    }
    
    // 匯出檔案
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    return true;
  } catch (error) {
    console.error('Excel匯出失敗:', error);
    return false;
  }
};

// 匯出儀表板數據到Excel
export const exportDashboardToExcel = (dashboardData, userRole, filename = '儀表板報表') => {
  try {
    const wb = XLSX.utils.book_new();
    
    // 總覽數據
    const overviewData = Object.entries(dashboardData.overview || {}).map(([key, value]) => ({
      '指標': key,
      '數值': typeof value === 'number' ? value.toLocaleString() : value
    }));
    
    if (overviewData.length > 0) {
      const ws1 = XLSX.utils.json_to_sheet(overviewData);
      autoFitColumns(overviewData, ws1);
      XLSX.utils.book_append_sheet(wb, ws1, '總覽');
    }
    
    // 月度數據
    if (dashboardData.monthlyRevenue && dashboardData.monthlyRevenue.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(dashboardData.monthlyRevenue);
      autoFitColumns(dashboardData.monthlyRevenue, ws2);
      XLSX.utils.book_append_sheet(wb, ws2, '月度營收');
    }
    
    // 團隊績效
    if (dashboardData.teamPerformance && dashboardData.teamPerformance.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(dashboardData.teamPerformance);
      autoFitColumns(dashboardData.teamPerformance, ws3);
      XLSX.utils.book_append_sheet(wb, ws3, '團隊績效');
    }
    
    // 待辦事項
    if (dashboardData.pendingActions && dashboardData.pendingActions.length > 0) {
      const actionData = dashboardData.pendingActions.map(a => ({
        '類型': a.type,
        '標題': a.title,
        '描述': a.description || '',
        '優先級': a.priority,
        '金額': a.amount || ''
      }));
      
      const ws4 = XLSX.utils.json_to_sheet(actionData);
      autoFitColumns(actionData, ws4);
      XLSX.utils.book_append_sheet(wb, ws4, '待辦事項');
    }
    
    // 匯出檔案
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `${filename}_${userRole}_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    return true;
  } catch (error) {
    console.error('Excel匯出失敗:', error);
    return false;
  }
};