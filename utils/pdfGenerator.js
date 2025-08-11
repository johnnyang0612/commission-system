// 勞務報酬單 PDF 生成工具
// 注意：身分證照片由會計後製上去，不上系統（資安考量）

export async function generateLaborCompensationForm(userData, compensationData) {
  try {
    // 檢查是否在瀏覽器環境中
    if (typeof window === 'undefined') {
      throw new Error('PDF generation only available in browser');
    }

    // 動態導入 jsPDF（只在瀏覽器中使用）
    const { jsPDF } = await import('jspdf');
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPosition = margin;

    // 設定中文字體（如果可用）
    doc.setFont('helvetica');
    
    // 標題
    doc.setFontSize(18);
    doc.text('勞務報酬給付清單', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 20;

    // 基本資訊區塊
    doc.setFontSize(12);
    doc.text('基本資料', margin, yPosition);
    yPosition += 15;

    const leftColumn = margin + 10;
    const rightColumn = pageWidth / 2 + 20;
    
    // 左欄
    doc.setFontSize(10);
    doc.text(`姓名：${userData.name || ''}`, leftColumn, yPosition);
    yPosition += 8;
    
    doc.text(`身分證號：${userData.national_id || ''}`, leftColumn, yPosition);
    yPosition += 8;
    
    doc.text(`出生日期：${userData.birth_date || ''}`, leftColumn, yPosition);
    yPosition += 8;
    
    doc.text(`電話：${userData.phone_number || ''}`, leftColumn, yPosition);
    yPosition += 8;
    
    doc.text(`手機：${userData.mobile_number || ''}`, leftColumn, yPosition);
    
    // 右欄（重置 y 位置）
    yPosition -= 32;
    doc.text(`職稱：${userData.job_title || ''}`, rightColumn, yPosition);
    yPosition += 8;
    
    doc.text(`部門：${userData.department || ''}`, rightColumn, yPosition);
    yPosition += 8;
    
    doc.text(`統一編號：${userData.tax_id_number || ''}`, rightColumn, yPosition);
    yPosition += 8;
    
    doc.text(`Email：${userData.email || ''}`, rightColumn, yPosition);
    yPosition += 20;

    // 地址資訊
    doc.text('地址資訊', margin, yPosition);
    yPosition += 15;
    
    doc.text(`戶籍地址：${userData.registered_address || ''}`, leftColumn, yPosition);
    yPosition += 8;
    
    doc.text(`通訊地址：${userData.mailing_address || userData.registered_address || ''}`, leftColumn, yPosition);
    yPosition += 20;

    // 銀行資訊
    doc.text('匯款帳戶', margin, yPosition);
    yPosition += 15;
    
    doc.text(`銀行名稱：${userData.bank_name || ''}`, leftColumn, yPosition);
    yPosition += 8;
    
    doc.text(`銀行代碼：${userData.bank_code || ''}`, leftColumn, yPosition);
    yPosition += 8;
    
    doc.text(`帳戶號碼：${userData.account_number || ''}`, leftColumn, yPosition);
    yPosition += 8;
    
    doc.text(`戶名：${userData.account_name || ''}`, leftColumn, yPosition);
    yPosition += 20;

    // 緊急聯絡人
    doc.text('緊急聯絡人', margin, yPosition);
    yPosition += 15;
    
    doc.text(`聯絡人：${userData.emergency_contact_name || ''}`, leftColumn, yPosition);
    yPosition += 8;
    
    doc.text(`電話：${userData.emergency_contact_phone || ''}`, leftColumn, yPosition);
    yPosition += 20;

    // 報酬資訊（如果提供）
    if (compensationData) {
      doc.text('報酬資訊', margin, yPosition);
      yPosition += 15;
      
      doc.text(`報酬總額：NT$ ${compensationData.totalAmount?.toLocaleString() || '0'}`, leftColumn, yPosition);
      yPosition += 8;
      
      doc.text(`免稅額：NT$ ${userData.tax_exemption_amount || 0}`, leftColumn, yPosition);
      yPosition += 8;
      
      doc.text(`扣繳率：${userData.withholding_tax_rate || 10}%`, leftColumn, yPosition);
      yPosition += 8;
      
      const taxableAmount = (compensationData.totalAmount || 0) - (userData.tax_exemption_amount || 0);
      const withholdingTax = Math.max(0, taxableAmount * (userData.withholding_tax_rate || 10) / 100);
      const netAmount = (compensationData.totalAmount || 0) - withholdingTax;
      
      doc.text(`應稅額：NT$ ${taxableAmount.toLocaleString()}`, leftColumn, yPosition);
      yPosition += 8;
      
      doc.text(`代扣稅額：NT$ ${withholdingTax.toLocaleString()}`, leftColumn, yPosition);
      yPosition += 8;
      
      doc.text(`實領金額：NT$ ${netAmount.toLocaleString()}`, leftColumn, yPosition);
      yPosition += 8;
      
      // 保險費用
      if (userData.health_insurance_fee || userData.labor_insurance_fee) {
        yPosition += 5;
        doc.text(`健保費：NT$ ${userData.health_insurance_fee || 0}`, leftColumn, yPosition);
        yPosition += 8;
        
        doc.text(`勞保費：NT$ ${userData.labor_insurance_fee || 0}`, leftColumn, yPosition);
        
        const finalAmount = netAmount - (userData.health_insurance_fee || 0) - (userData.labor_insurance_fee || 0);
        yPosition += 8;
        doc.setFontSize(12);
        doc.text(`最終實領：NT$ ${finalAmount.toLocaleString()}`, leftColumn, yPosition);
      }
    }

    // 頁尾
    yPosition = doc.internal.pageSize.getHeight() - 30;
    doc.setFontSize(8);
    doc.text('※ 本表單由川輝科技業務分潤管理系統自動產生', margin, yPosition);
    doc.text('※ 身分證照片由會計部門另行處理（基於資安考量不存於系統中）', margin, yPosition + 8);
    doc.text(`※ 產生時間：${new Date().toLocaleString('zh-TW')}`, margin, yPosition + 16);

    return doc;
  } catch (error) {
    console.error('PDF 生成失敗:', error);
    throw error;
  }
}

// 下載勞務報酬單
export async function downloadLaborCompensationForm(userData, compensationData = null) {
  try {
    const doc = await generateLaborCompensationForm(userData, compensationData);
    const fileName = `勞務報酬單_${userData.name || 'Unknown'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error('下載失敗:', error);
    throw new Error('下載勞務報酬單失敗: ' + error.message);
  }
}