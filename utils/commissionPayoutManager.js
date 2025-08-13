// 分潤撥款管理工具
import { supabase } from './supabaseClient';
import { generateLaborReceipt } from './laborReceiptGenerator';

/**
 * 計算可撥款的分潤金額（基於實際收款）
 * @param {string} projectId - 專案ID
 * @returns {Object} 可撥款分潤資訊
 */
export async function calculateAvailableCommissionPayout(projectId) {
  try {
    // 1. 獲取專案資訊
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw new Error(`無法找到專案: ${projectError?.message}`);
    }

    // 2. 獲取專案的分潤記錄
    const { data: commissions, error: commissionError } = await supabase
      .from('commissions')
      .select('*')
      .eq('project_id', projectId);

    if (commissionError) {
      throw new Error(`獲取分潤記錄失敗: ${commissionError.message}`);
    }

    // 3. 獲取專案的客戶付款記錄
    const { data: payments, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('project_id', projectId)
      .order('payment_date', { ascending: true });

    if (paymentError) {
      throw new Error(`獲取付款記錄失敗: ${paymentError.message}`);
    }

    // 4. 計算總收款和收款比例
    const totalProjectAmount = project.amount || 0;
    const totalPaidAmount = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    const paymentRatio = totalProjectAmount > 0 ? totalPaidAmount / totalProjectAmount : 0;

    // 5. 為每個分潤計算可撥款金額
    const results = [];
    
    for (const commission of commissions) {
      // 獲取已撥款記錄
      const { data: existingPayouts } = await supabase
        .from('commission_payouts')
        .select('*')
        .eq('commission_id', commission.id)
        .eq('status', 'paid');

      const totalPaidCommission = existingPayouts?.reduce((sum, payout) => sum + (payout.payout_amount || 0), 0) || 0;
      
      // 計算應得分潤和可撥款分潤
      const totalCommissionAmount = commission.amount || 0;
      const availableCommissionAmount = (totalCommissionAmount * paymentRatio) - totalPaidCommission;

      results.push({
        commission,
        totalCommissionAmount,
        totalPaidCommission,
        availableCommissionAmount: Math.max(0, availableCommissionAmount),
        paymentRatio,
        canPayout: availableCommissionAmount > 0
      });
    }

    return {
      success: true,
      project,
      totalProjectAmount,
      totalPaidAmount,
      paymentRatio,
      commissions: results
    };

  } catch (error) {
    console.error('計算可撥款分潤錯誤:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 執行分潤撥款
 * @param {string} commissionId - 分潤記錄ID
 * @param {number} payoutAmount - 撥款金額
 * @param {Object} payoutData - 撥款資料
 * @returns {Object} 撥款結果
 */
export async function executeCommissionPayout(commissionId, payoutAmount, payoutData = {}) {
  try {
    // 1. 獲取分潤記錄
    const { data: commission, error: commissionError } = await supabase
      .from('commissions')
      .select(`
        *,
        project:project_id (
          id,
          project_name,
          project_code,
          client_name,
          amount
        ),
        user:user_id (
          id,
          name,
          email
        )
      `)
      .eq('id', commissionId)
      .single();

    if (commissionError || !commission) {
      throw new Error(`無法找到分潤記錄: ${commissionError?.message}`);
    }

    // 2. 驗證撥款金額
    const availableInfo = await calculateAvailableCommissionPayout(commission.project_id);
    if (!availableInfo.success) {
      throw new Error(`計算可撥款金額失敗: ${availableInfo.error}`);
    }

    const commissionInfo = availableInfo.commissions.find(c => c.commission.id === commissionId);
    if (!commissionInfo || payoutAmount > commissionInfo.availableCommissionAmount) {
      throw new Error(`撥款金額超過可撥款額度 (可撥款: ${commissionInfo?.availableCommissionAmount || 0})`);
    }

    // 3. 計算撥款比例和對應的客戶付款
    const paymentBasis = payoutAmount / (commission.percentage / 100); // 對應的客戶付款金額
    const payoutRatio = payoutAmount / commission.amount; // 撥款比例

    // 4. 創建撥款記錄
    const payoutRecord = {
      commission_id: commissionId,
      project_id: commission.project_id,
      user_id: commission.user_id,
      payout_date: payoutData.payoutDate || new Date().toISOString().split('T')[0],
      payout_amount: payoutAmount,
      payment_basis: paymentBasis,
      payout_ratio: payoutRatio,
      related_payment_id: payoutData.relatedPaymentId || null,
      notes: payoutData.notes || `分期撥款 - ${(payoutRatio * 100).toFixed(2)}%`,
      status: 'paid'
    };

    const { data: newPayout, error: payoutError } = await supabase
      .from('commission_payouts')
      .insert([payoutRecord])
      .select()
      .single();

    if (payoutError) {
      throw new Error(`創建撥款記錄失敗: ${payoutError.message}`);
    }

    // 5. 自動產生勞務報酬單
    const receiptResult = await generateLaborReceipt(commissionId, {
      paymentDate: payoutRecord.payout_date,
      partialAmount: payoutAmount, // 傳入部分撥款金額
      payoutId: newPayout.id
    });

    // 6. 更新撥款記錄，關聯勞務報酬單
    if (receiptResult.success) {
      await supabase
        .from('commission_payouts')
        .update({ labor_receipt_id: receiptResult.receiptId })
        .eq('id', newPayout.id);
    }

    // 7. 檢查是否已全額撥款，如果是則更新分潤狀態
    const updatedInfo = await calculateAvailableCommissionPayout(commission.project_id);
    const updatedCommissionInfo = updatedInfo.commissions.find(c => c.commission.id === commissionId);
    
    if (updatedCommissionInfo && updatedCommissionInfo.availableCommissionAmount <= 0.01) { // 容許1分錢誤差
      await supabase
        .from('commissions')
        .update({ status: 'fully_paid' })
        .eq('id', commissionId);
    }

    return {
      success: true,
      payoutId: newPayout.id,
      payoutAmount,
      laborReceiptResult: receiptResult,
      message: `撥款成功！金額：NT$ ${payoutAmount.toLocaleString()}`
    };

  } catch (error) {
    console.error('執行分潤撥款錯誤:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 自動撥款（當客戶付款時觸發）
 * @param {string} projectId - 專案ID
 * @param {number} paymentAmount - 客戶付款金額
 * @param {string} paymentId - 付款記錄ID
 * @returns {Object} 自動撥款結果
 */
export async function autoPayoutCommissions(projectId, paymentAmount, paymentId) {
  try {
    // 計算可撥款分潤
    const availableInfo = await calculateAvailableCommissionPayout(projectId);
    if (!availableInfo.success) {
      throw new Error(`計算可撥款分潤失敗: ${availableInfo.error}`);
    }

    const results = [];
    
    // 為每個有可撥款額度的分潤執行撥款
    for (const commissionInfo of availableInfo.commissions) {
      if (commissionInfo.canPayout && commissionInfo.availableCommissionAmount > 0) {
        const result = await executeCommissionPayout(
          commissionInfo.commission.id,
          commissionInfo.availableCommissionAmount,
          {
            payoutDate: new Date().toISOString().split('T')[0],
            relatedPaymentId: paymentId,
            notes: `自動撥款 - 客戶付款 NT$ ${paymentAmount.toLocaleString()}`
          }
        );
        
        results.push({
          commissionId: commissionInfo.commission.id,
          userId: commissionInfo.commission.user_id,
          result
        });
      }
    }

    return {
      success: true,
      payoutsProcessed: results.length,
      results
    };

  } catch (error) {
    console.error('自動撥款錯誤:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 獲取分潤撥款記錄
 * @param {Object} filters - 篩選條件
 * @returns {Object} 撥款記錄列表
 */
export async function getCommissionPayouts(filters = {}) {
  try {
    let query = supabase
      .from('commission_payouts')
      .select(`
        *,
        commission:commission_id (
          id,
          percentage,
          amount as total_commission_amount
        ),
        project:project_id (
          project_code,
          project_name,
          client_name
        ),
        user:user_id (
          name,
          email
        ),
        labor_receipt:labor_receipt_id (
          receipt_number,
          net_amount,
          status
        )
      `);

    // 應用篩選條件
    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters.commissionId) {
      query = query.eq('commission_id', filters.commissionId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.dateFrom) {
      query = query.gte('payout_date', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('payout_date', filters.dateTo);
    }

    const { data, error } = await query.order('payout_date', { ascending: false });

    if (error) {
      throw new Error(`獲取撥款記錄失敗: ${error.message}`);
    }

    return {
      success: true,
      data: data || []
    };

  } catch (error) {
    console.error('獲取撥款記錄錯誤:', error);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
}