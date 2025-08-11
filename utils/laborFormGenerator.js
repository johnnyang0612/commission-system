// 勞務報酬單生成器 - 支援中文

// 動態載入 pdfmake（只在瀏覽器環境）
let pdfMake = null;

async function loadPdfMake() {
  if (typeof window !== 'undefined' && !pdfMake) {
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
    pdfMake = pdfMakeModule.default || pdfMakeModule;
    
    if (pdfFontsModule.pdfMake) {
      pdfMake.vfs = pdfFontsModule.pdfMake.vfs;
    } else if (pdfFontsModule.default) {
      pdfMake.vfs = pdfFontsModule.default.pdfMake.vfs;
    }
    
    // 添加中文字體支援
    pdfMake.fonts = {
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf'
      }
    };
  }
  return pdfMake;
}

/**
 * 生成專案分期的勞務報酬單
 * @param {Object} projectData - 專案資料
 * @param {Object} installmentData - 分期資料
 * @param {Object} userData - 業務人員資料
 * @param {Object} commissionData - 分潤資料
 */
export async function generateInstallmentLaborForm(projectData, installmentData, userData, commissionData) {
  try {
    if (typeof window === 'undefined') {
      throw new Error('PDF generation only available in browser');
    }
    
    // 確保 pdfMake 已載入
    await loadPdfMake();
    if (!pdfMake) {
      throw new Error('Failed to load PDF library');
    }

    const currentDate = new Date().toLocaleDateString('zh-TW');
    const year = new Date().getFullYear() - 1911; // 民國年
    
    // 計算勞務報酬金額
    const grossAmount = commissionData.amount || 0;
    const taxExemption = userData.tax_exemption_amount || 0;
    const taxableAmount = Math.max(grossAmount - taxExemption, 0);
    const withholdingTaxRate = userData.withholding_tax_rate || 10;
    const withholdingTax = Math.round(taxableAmount * withholdingTaxRate / 100);
    const healthInsurance = userData.health_insurance_fee || Math.round(grossAmount * 0.0211);
    const netAmount = grossAmount - withholdingTax - healthInsurance;

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      defaultStyle: {
        font: 'Roboto',
        fontSize: 11
      },
      content: [
        {
          text: '川輝科技有限公司',
          style: 'header',
          alignment: 'center'
        },
        {
          text: '勞務報酬給付清單',
          style: 'title',
          alignment: 'center',
          margin: [0, 10, 0, 20]
        },
        
        // 基本資訊
        {
          columns: [
            { text: `日期: ${currentDate}`, width: '50%' },
            { text: `單據編號: ${projectData.project_code}-${installmentData.installment_number}`, width: '50%', alignment: 'right' }
          ],
          margin: [0, 0, 0, 10]
        },
        
        // 專案資訊
        {
          text: '專案資訊',
          style: 'sectionHeader',
          margin: [0, 10, 0, 5]
        },
        {
          table: {
            widths: ['30%', '70%'],
            body: [
              ['專案名稱', projectData.project_name || ''],
              ['專案編號', projectData.project_code || ''],
              ['客戶名稱', projectData.client_name || ''],
              ['分期說明', `第 ${installmentData.installment_number} 期 - ${installmentData.description || ''}`],
              ['分期金額', `NT$ ${installmentData.amount?.toLocaleString() || 0}`],
              ['分潤比例', `${commissionData.commission_rate || 0}%`]
            ]
          },
          margin: [0, 0, 0, 15]
        },
        
        // 受款人資訊
        {
          text: '受款人資訊',
          style: 'sectionHeader',
          margin: [0, 10, 0, 5]
        },
        {
          table: {
            widths: ['30%', '70%'],
            body: [
              ['姓名', userData.name || ''],
              ['身分證字號', userData.national_id ? userData.national_id.substring(0, 3) + '****' + userData.national_id.substring(7) : ''],
              ['聯絡電話', userData.phone_number || userData.mobile_number || ''],
              ['戶籍地址', userData.registered_address || ''],
              ['通訊地址', userData.mailing_address || userData.registered_address || '']
            ]
          },
          margin: [0, 0, 0, 15]
        },
        
        // 給付明細
        {
          text: '給付明細',
          style: 'sectionHeader',
          margin: [0, 10, 0, 5]
        },
        {
          table: {
            widths: ['30%', '35%', '35%'],
            body: [
              [
                { text: '項目', bold: true },
                { text: '計算方式', bold: true },
                { text: '金額', bold: true, alignment: 'right' }
              ],
              ['勞務報酬總額', `${installmentData.amount?.toLocaleString()} × ${commissionData.commission_rate}%`, `NT$ ${grossAmount.toLocaleString()}`],
              ['免稅額', '-', `NT$ ${taxExemption.toLocaleString()}`],
              ['應稅金額', '勞務報酬總額 - 免稅額', `NT$ ${taxableAmount.toLocaleString()}`],
              ['扣繳稅額', `${withholdingTaxRate}%`, `NT$ ${withholdingTax.toLocaleString()}`],
              ['二代健保費', '2.11%', `NT$ ${healthInsurance.toLocaleString()}`],
              [
                { text: '實付金額', bold: true },
                { text: '總額 - 扣繳稅額 - 健保費', bold: true },
                { text: `NT$ ${netAmount.toLocaleString()}`, bold: true, alignment: 'right' }
              ]
            ]
          },
          margin: [0, 0, 0, 15]
        },
        
        // 銀行資訊
        {
          text: '匯款資訊',
          style: 'sectionHeader',
          margin: [0, 10, 0, 5]
        },
        {
          table: {
            widths: ['30%', '70%'],
            body: [
              ['銀行名稱', userData.bank_name || ''],
              ['銀行代碼', userData.bank_code || ''],
              ['帳號', userData.account_number || ''],
              ['戶名', userData.account_name || userData.name || '']
            ]
          },
          margin: [0, 0, 0, 20]
        },
        
        // 簽名區
        {
          columns: [
            {
              width: '50%',
              stack: [
                { text: '受款人簽章:', margin: [0, 30, 0, 0] },
                { text: '_____________________', margin: [0, 30, 0, 0] },
                { text: `簽名: ${userData.name || ''}`, fontSize: 9, margin: [0, 5, 0, 0] }
              ]
            },
            {
              width: '50%',
              stack: [
                { text: '公司核章:', alignment: 'right', margin: [0, 30, 0, 0] },
                { text: '_____________________', alignment: 'right', margin: [0, 30, 0, 0] },
                { text: '川輝科技有限公司', fontSize: 9, alignment: 'right', margin: [0, 5, 0, 0] }
              ]
            }
          ]
        },
        
        // 註記
        {
          text: [
            { text: '註記:\n', bold: true },
            '1. 本單據為勞務報酬支付憑證，請妥善保存。\n',
            '2. 扣繳稅額將依法申報並繳納。\n',
            '3. 身分證照片由會計部門另行處理，不列印於本單據。\n',
            `4. 列印日期: ${currentDate}`
          ],
          fontSize: 9,
          color: '#666666',
          margin: [0, 30, 0, 0]
        }
      ],
      styles: {
        header: {
          fontSize: 18,
          bold: true
        },
        title: {
          fontSize: 16,
          bold: true
        },
        sectionHeader: {
          fontSize: 13,
          bold: true,
          color: '#2c3e50'
        }
      }
    };

    // 生成並下載 PDF
    const fileName = `勞務報酬單_${projectData.project_code}_第${installmentData.installment_number}期_${userData.name}_${new Date().getTime()}.pdf`;
    pdfMake.createPdf(docDefinition).download(fileName);
    
    return { success: true, fileName };
  } catch (error) {
    console.error('生成勞務報酬單失敗:', error);
    throw error;
  }
}

/**
 * 批量生成多個分期的勞務報酬單
 */
export async function generateBatchLaborForms(projectData, installments, userData, commissionRate) {
  // 確保 pdfMake 已載入
  await loadPdfMake();
  if (!pdfMake) {
    throw new Error('Failed to load PDF library');
  }
  
  const results = [];
  
  for (const installment of installments) {
    try {
      const commissionData = {
        amount: Math.round(installment.amount * commissionRate / 100),
        commission_rate: commissionRate
      };
      
      const result = await generateInstallmentLaborForm(
        projectData,
        installment,
        userData,
        commissionData
      );
      
      results.push(result);
      
      // 延遲一下避免同時生成太多
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`生成第 ${installment.installment_number} 期勞務報酬單失敗:`, error);
      results.push({ 
        success: false, 
        error: error.message,
        installment: installment.installment_number 
      });
    }
  }
  
  return results;
}