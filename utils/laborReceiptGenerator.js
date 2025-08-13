// 勞務報酬單自動產生工具
import { supabase } from './supabaseClient';

/**
 * 當分潤實際發放後，自動產生勞務報酬單
 * @param {string} commissionId - 分潤記錄ID
 * @param {Object} paymentData - 付款資訊
 * @returns {Object} 結果對象
 */
export async function generateLaborReceipt(commissionId, paymentData = {}) {
  try {
    // 1. 獲取分潤記錄詳情
    const { data: commission, error: commissionError } = await supabase
      .from('commissions')
      .select(`
        *,
        project:project_id (
          id,
          project_name,
          project_code,
          client_name,
          amount,
          sign_date,
          expected_completion_date
        ),
        user:user_id (
          id,
          name,
          email,
          id_number,
          address
        )
      `)
      .eq('id', commissionId)
      .single();

    if (commissionError || !commission) {
      throw new Error(`無法找到分潤記錄: ${commissionError?.message}`);
    }

    // 2. 檢查是否已經產生過勞務報酬單
    const { data: existingReceipt } = await supabase
      .from('labor_receipts')
      .select('id')
      .eq('commission_id', commissionId)
      .single();

    if (existingReceipt) {
      return {
        success: false,
        error: '該分潤記錄已經產生過勞務報酬單',
        receiptId: existingReceipt.id
      };
    }

    // 3. 計算稅費和實際發放金額
    // 如果是部分撥款，使用指定金額，否則使用全額
    const grossAmount = paymentData.partialAmount || commission.amount || 0;
    const taxAmount = grossAmount * 0.10; // 10% 扣繳稅
    const insuranceAmount = grossAmount * 0.0211; // 2.11% 二代健保費
    const netAmount = grossAmount - taxAmount - insuranceAmount;

    // 4. 準備勞務報酬單資料
    const receiptData = {
      project_id: commission.project_id,
      user_id: commission.user_id,
      commission_id: commissionId,
      
      receipt_date: paymentData.paymentDate || new Date().toISOString().split('T')[0],
      period_start: commission.project?.sign_date || new Date().toISOString().split('T')[0],
      period_end: commission.project?.expected_completion_date || new Date().toISOString().split('T')[0],
      
      gross_amount: grossAmount,
      tax_amount: taxAmount,
      insurance_amount: insuranceAmount,
      net_amount: netAmount,
      
      project_name: commission.project?.project_name || '',
      project_code: commission.project?.project_code || '',
      client_name: commission.project?.client_name || '',
      
      recipient_name: commission.user?.name || '',
      recipient_id: commission.user?.id_number || '',
      recipient_address: commission.user?.address || '',
      
      status: 'issued', // 直接設為已開立
      issued_at: new Date().toISOString(),
      
      notes: `自動產生 - 專案分潤發放 (${commission.percentage}%)`
    };

    // 5. 插入勞務報酬單
    const { data: newReceipt, error: insertError } = await supabase
      .from('labor_receipts')
      .insert([receiptData])
      .select()
      .single();

    if (insertError) {
      throw new Error(`產生勞務報酬單失敗: ${insertError.message}`);
    }

    // 6. 更新分潤記錄，標記已產生勞務報酬單
    await supabase
      .from('commissions')
      .update({ 
        labor_receipt_generated: true,
        labor_receipt_id: newReceipt.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', commissionId);

    return {
      success: true,
      receiptId: newReceipt.id,
      receiptNumber: newReceipt.receipt_number,
      grossAmount,
      taxAmount,
      insuranceAmount,
      netAmount,
      message: `勞務報酬單已自動產生 (編號: ${newReceipt.receipt_number})`
    };

  } catch (error) {
    console.error('產生勞務報酬單錯誤:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 批量產生勞務報酬單（針對已發放的分潤）
 * @returns {Object} 結果統計
 */
export async function generatePendingLaborReceipts() {
  try {
    // 找出已發放但未產生勞務報酬單的分潤記錄
    const { data: commissions, error } = await supabase
      .from('commissions')
      .select('id')
      .eq('status', 'paid')
      .neq('labor_receipt_generated', true);

    if (error || !commissions) {
      throw new Error(`無法獲取分潤記錄: ${error?.message}`);
    }

    let successCount = 0;
    let failCount = 0;
    const results = [];

    // 逐一處理每個分潤記錄
    for (const commission of commissions) {
      const result = await generateLaborReceipt(commission.id);
      results.push(result);
      
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    return {
      success: true,
      totalProcessed: commissions.length,
      successCount,
      failCount,
      results
    };

  } catch (error) {
    console.error('批量產生勞務報酬單錯誤:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 獲取勞務報酬單列表
 * @param {Object} filters - 篩選條件
 * @returns {Object} 勞務報酬單列表
 */
export async function getLaborReceipts(filters = {}) {
  try {
    let query = supabase
      .from('labor_receipts')
      .select(`
        *,
        project:project_id (
          project_name,
          project_code,
          client_name
        ),
        user:user_id (
          name,
          email
        ),
        commission:commission_id (
          percentage,
          amount as commission_amount
        )
      `);

    // 應用篩選條件
    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.dateFrom) {
      query = query.gte('receipt_date', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('receipt_date', filters.dateTo);
    }

    const { data, error } = await query.order('receipt_date', { ascending: false });

    if (error) {
      throw new Error(`獲取勞務報酬單失敗: ${error.message}`);
    }

    return {
      success: true,
      data: data || []
    };

  } catch (error) {
    console.error('獲取勞務報酬單錯誤:', error);
    return {
      success: false,
      error: error.message,
      data: []
    };
  }
}