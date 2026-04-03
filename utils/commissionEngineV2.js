// ============================================================
// commissionEngineV2.js
// 分潤引擎 V2 - 支援淨額計算、事件模型、預支沖銷
// Commission Engine V2 - Net-of-tax, event-based, advance offset
// ============================================================

import { supabase } from './supabaseClient';

// ---- 常數 ----
const TAX_WITHHOLDING_RATE = 0.10;       // 扣繳稅率 10%
const INSURANCE_RATE = 0.0211;           // 二代健保補充保費 2.11%
const INSURANCE_THRESHOLD = 20000;       // 二代健保起徵門檻 (TWD)
const DEFAULT_TAX_RATE = 0.05;           // 預設營業稅率 5%

// ============================================================
// 1. calculateNetAmount - 計算未稅金額
// ============================================================

/**
 * Calculate the net (before-tax) amount from a gross (tax-inclusive) amount.
 * 計算未稅金額：將含稅金額反推為未稅金額。
 *
 * @param {number} grossAmount - 含稅金額 (tax-inclusive amount)
 * @param {number} [taxRate=0.05] - 營業稅率 (tax rate, default 5%)
 * @returns {{ success: boolean, netAmount?: number, taxAmount?: number, grossAmount?: number, taxRate?: number, error?: string }}
 */
export function calculateNetAmount(grossAmount, taxRate = DEFAULT_TAX_RATE) {
  try {
    if (typeof grossAmount !== 'number' || isNaN(grossAmount)) {
      return { success: false, error: '含稅金額必須為有效數值' };
    }
    if (grossAmount < 0) {
      return { success: false, error: '含稅金額不得為負數' };
    }
    if (typeof taxRate !== 'number' || isNaN(taxRate) || taxRate < 0) {
      return { success: false, error: '稅率必須為非負有效數值' };
    }

    const netAmount = Math.round((grossAmount / (1 + taxRate)) * 100) / 100;
    const taxAmount = Math.round((grossAmount - netAmount) * 100) / 100;

    return {
      success: true,
      netAmount,
      taxAmount,
      grossAmount,
      taxRate,
    };
  } catch (error) {
    console.error('計算未稅金額錯誤:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 2. getCommissionRule - 取得專案分潤規則
// ============================================================

/**
 * Fetch the commission rule for a specific project and user.
 * Falls back to the legacy `commissions` table when no rule exists in `commission_rules`.
 * 取得分潤規則：先查 commission_rules，若無則 fallback 至 commissions 舊表。
 *
 * @param {string} projectId - 專案 UUID
 * @param {string} userId - 使用者 UUID
 * @returns {{ success: boolean, rule?: object, source?: string, error?: string }}
 */
export async function getCommissionRule(projectId, userId) {
  try {
    if (!supabase) {
      return { success: false, error: 'Supabase 客戶端未初始化' };
    }
    if (!projectId || !userId) {
      return { success: false, error: '缺少 projectId 或 userId' };
    }

    // 優先查詢新表 commission_rules
    const { data: rule, error: ruleError } = await supabase
      .from('commission_rules')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (rule && !ruleError) {
      return {
        success: true,
        rule: {
          id: rule.id,
          project_id: rule.project_id,
          user_id: rule.user_id,
          commission_rate: parseFloat(rule.commission_rate),
          basis_type: rule.basis_type || 'net_received',
          tax_rate_for_deduction: parseFloat(rule.tax_rate_for_deduction ?? DEFAULT_TAX_RATE),
          notes: rule.notes,
        },
        source: 'commission_rules',
      };
    }

    // Fallback: 查詢舊表 commissions
    const { data: legacy, error: legacyError } = await supabase
      .from('commissions')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (legacy && !legacyError) {
      // 將舊格式轉換為新格式
      const commissionRate = legacy.percentage
        ? parseFloat(legacy.percentage) / 100
        : (legacy.amount && legacy.project_amount
          ? legacy.amount / legacy.project_amount
          : 0);

      return {
        success: true,
        rule: {
          id: legacy.id,
          project_id: legacy.project_id,
          user_id: legacy.user_id,
          commission_rate: commissionRate,
          basis_type: 'contract_amount',   // 舊模式以合約金額為基礎
          tax_rate_for_deduction: DEFAULT_TAX_RATE,
          notes: `[Legacy] 從 commissions 表轉換`,
        },
        source: 'commissions',
      };
    }

    return {
      success: false,
      error: `找不到專案 ${projectId} 中使用者 ${userId} 的分潤規則`,
    };
  } catch (error) {
    console.error('取得分潤規則錯誤:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 3. createCommissionEvent - 建立分潤事件
// ============================================================

/**
 * Create a commission event when a customer payment is recorded.
 * Calculates net received, commission amount, checks for advance offsets,
 * and inserts records into both `commission_events` and `finance_transactions`.
 * 建立分潤事件：客戶付款時觸發，計算淨額與分潤，檢查預支沖銷，寫入事件與交易紀錄。
 *
 * @param {string} projectId - 專案 UUID
 * @param {string} userId - 業務人員 UUID
 * @param {object} paymentData - 付款資料
 * @param {number} paymentData.grossReceived - 客戶實際支付的含稅金額
 * @param {number} [paymentData.taxRate=0.05] - 營業稅率
 * @param {string} [paymentData.paymentScheduleId] - 對應的付款期程 ID
 * @param {string} [paymentData.triggerType='customer_payment'] - 觸發類型
 * @param {string} [paymentData.notes] - 備註
 * @returns {{ success: boolean, event?: object, transaction?: object, offsetResult?: object, error?: string }}
 */
export async function createCommissionEvent(projectId, userId, paymentData) {
  try {
    if (!supabase) {
      return { success: false, error: 'Supabase 客戶端未初始化' };
    }
    if (!projectId || !userId || !paymentData) {
      return { success: false, error: '缺少必要參數 (projectId, userId, paymentData)' };
    }

    const {
      grossReceived,
      taxRate = DEFAULT_TAX_RATE,
      paymentScheduleId = null,
      triggerType = 'customer_payment',
      notes = '',
    } = paymentData;

    if (typeof grossReceived !== 'number' || grossReceived <= 0) {
      return { success: false, error: '含稅金額必須為正數' };
    }

    // 1. 取得分潤規則
    const ruleResult = await getCommissionRule(projectId, userId);
    if (!ruleResult.success) {
      return { success: false, error: `取得分潤規則失敗: ${ruleResult.error}` };
    }

    const { rule, source: ruleSource } = ruleResult;

    // 2. 根據 basis_type 計算分潤基數
    const effectiveTaxRate = rule.tax_rate_for_deduction ?? taxRate;
    const netResult = calculateNetAmount(grossReceived, effectiveTaxRate);
    if (!netResult.success) {
      return { success: false, error: `計算淨額失敗: ${netResult.error}` };
    }

    let commissionBase;
    switch (rule.basis_type) {
      case 'net_received':
        commissionBase = netResult.netAmount;
        break;
      case 'gross_received':
        commissionBase = grossReceived;
        break;
      case 'contract_amount':
        // 對於 contract_amount 基礎，仍以實際收款淨額計算（V2 預設行為）
        commissionBase = netResult.netAmount;
        break;
      default:
        commissionBase = netResult.netAmount;
    }

    const calculatedCommission = Math.round(commissionBase * rule.commission_rate * 100) / 100;

    // 3. 寫入 commission_events
    const eventRecord = {
      project_id: projectId,
      user_id: userId,
      commission_rule_id: ruleSource === 'commission_rules' ? rule.id : null,
      payment_schedule_id: paymentScheduleId,
      trigger_type: triggerType,
      gross_received: grossReceived,
      tax_deducted: netResult.taxAmount,
      net_received: netResult.netAmount,
      commission_rate: rule.commission_rate,
      calculated_commission: calculatedCommission,
      status: 'pending',
      notes: notes || `V2 引擎自動產生 (規則來源: ${ruleSource})`,
    };

    const { data: newEvent, error: eventError } = await supabase
      .from('commission_events')
      .insert([eventRecord])
      .select()
      .single();

    if (eventError) {
      throw new Error(`寫入分潤事件失敗: ${eventError.message}`);
    }

    // 4. 寫入 finance_transactions
    const txRecord = {
      project_id: projectId,
      user_id: userId,
      transaction_type: 'commission_payout',
      amount: calculatedCommission,
      currency: 'TWD',
      description: `分潤事件 - 含稅收款 ${grossReceived}, 淨額 ${netResult.netAmount}, 分潤率 ${(rule.commission_rate * 100).toFixed(2)}%`,
      reference_type: 'commission_event',
      reference_id: newEvent.id,
      needs_labor_receipt: true,
      transaction_date: new Date().toISOString().split('T')[0],
    };

    const { data: newTx, error: txError } = await supabase
      .from('finance_transactions')
      .insert([txRecord])
      .select()
      .single();

    if (txError) {
      console.error('寫入財務交易紀錄失敗（分潤事件已建立）:', txError);
      // 不回滾分潤事件，但回報警告
    }

    // 5. 嘗試沖銷預支
    let offsetResult = null;
    try {
      offsetResult = await offsetAdvanceFromCommission(newEvent.id);
    } catch (offsetErr) {
      console.error('預支沖銷時發生錯誤（不影響分潤事件）:', offsetErr);
    }

    return {
      success: true,
      event: newEvent,
      transaction: newTx || null,
      offsetResult,
      summary: {
        grossReceived,
        taxDeducted: netResult.taxAmount,
        netReceived: netResult.netAmount,
        commissionRate: rule.commission_rate,
        calculatedCommission,
        basisType: rule.basis_type,
        ruleSource,
      },
    };
  } catch (error) {
    console.error('建立分潤事件錯誤:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 4. processAdvancePayout - 處理分潤預支
// ============================================================

/**
 * Create an advance payout record for a user on a project.
 * Also creates a finance_transaction and auto-generates a labor receipt.
 * 處理分潤預支：建立預支紀錄、財務交易、自動產生勞報單。
 *
 * @param {string} projectId - 專案 UUID
 * @param {string} userId - 業務人員 UUID
 * @param {number} advanceAmount - 預支金額
 * @param {string} [reason=''] - 預支原因
 * @param {string} [approvedBy=null] - 核准者 UUID
 * @returns {{ success: boolean, advance?: object, transaction?: object, laborReceipt?: object, error?: string }}
 */
export async function processAdvancePayout(projectId, userId, advanceAmount, reason = '', approvedBy = null) {
  try {
    if (!supabase) {
      return { success: false, error: 'Supabase 客戶端未初始化' };
    }
    if (!projectId || !userId) {
      return { success: false, error: '缺少 projectId 或 userId' };
    }
    if (typeof advanceAmount !== 'number' || advanceAmount <= 0) {
      return { success: false, error: '預支金額必須為正數' };
    }

    // 1. 寫入 payout_advance_records
    const advanceRecord = {
      project_id: projectId,
      user_id: userId,
      advance_amount: advanceAmount,
      remaining_to_offset: advanceAmount,
      offset_status: 'pending',
      reason: reason || '分潤預支',
      approved_by: approvedBy,
      approved_at: approvedBy ? new Date().toISOString() : null,
    };

    const { data: newAdvance, error: advanceError } = await supabase
      .from('payout_advance_records')
      .insert([advanceRecord])
      .select()
      .single();

    if (advanceError) {
      throw new Error(`建立預支紀錄失敗: ${advanceError.message}`);
    }

    // 2. 寫入 finance_transactions
    const txRecord = {
      project_id: projectId,
      user_id: userId,
      transaction_type: 'advance_payout',
      amount: advanceAmount,
      currency: 'TWD',
      description: `分潤預支 - ${reason || '無特定原因'}`,
      reference_type: 'payout_advance_record',
      reference_id: newAdvance.id,
      needs_labor_receipt: true,
      transaction_date: new Date().toISOString().split('T')[0],
    };

    const { data: newTx, error: txError } = await supabase
      .from('finance_transactions')
      .insert([txRecord])
      .select()
      .single();

    if (txError) {
      console.error('寫入預支財務交易紀錄失敗:', txError);
    }

    // 3. 自動產生勞報單
    let laborReceiptResult = null;
    try {
      laborReceiptResult = await generateLaborReceiptForAdvance(projectId, userId, advanceAmount, newAdvance.id);
    } catch (receiptErr) {
      console.error('自動產生預支勞報單失敗:', receiptErr);
    }

    // 4. 關聯勞報單至 finance_transactions
    if (laborReceiptResult?.success && laborReceiptResult.receiptId && newTx) {
      await supabase
        .from('finance_transactions')
        .update({ labor_receipt_id: laborReceiptResult.receiptId })
        .eq('id', newTx.id);
    }

    return {
      success: true,
      advance: newAdvance,
      transaction: newTx || null,
      laborReceipt: laborReceiptResult,
    };
  } catch (error) {
    console.error('處理分潤預支錯誤:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 5. offsetAdvanceFromCommission - 預支沖銷
// ============================================================

/**
 * When a commission event is created, check for pending advances and offset them.
 * Deducts the advance from the new commission's calculated amount.
 * 預支沖銷：分潤事件建立時，檢查是否有待沖銷的預支，自動扣抵。
 *
 * @param {string} commissionEventId - 分潤事件 UUID
 * @returns {{ success: boolean, offsets?: Array, totalOffset?: number, remainingCommission?: number, error?: string }}
 */
export async function offsetAdvanceFromCommission(commissionEventId) {
  try {
    if (!supabase) {
      return { success: false, error: 'Supabase 客戶端未初始化' };
    }
    if (!commissionEventId) {
      return { success: false, error: '缺少 commissionEventId' };
    }

    // 1. 取得分潤事件
    const { data: event, error: eventError } = await supabase
      .from('commission_events')
      .select('*')
      .eq('id', commissionEventId)
      .single();

    if (eventError || !event) {
      return { success: false, error: `找不到分潤事件: ${eventError?.message || '紀錄不存在'}` };
    }

    // 2. 查詢該使用者在該專案下的待沖銷預支
    const { data: pendingAdvances, error: advanceError } = await supabase
      .from('payout_advance_records')
      .select('*')
      .eq('project_id', event.project_id)
      .eq('user_id', event.user_id)
      .in('offset_status', ['pending', 'partially_offset'])
      .gt('remaining_to_offset', 0)
      .order('created_at', { ascending: true }); // FIFO：先建立的先沖

    if (advanceError) {
      throw new Error(`查詢待沖銷預支失敗: ${advanceError.message}`);
    }

    if (!pendingAdvances || pendingAdvances.length === 0) {
      return {
        success: true,
        offsets: [],
        totalOffset: 0,
        remainingCommission: parseFloat(event.calculated_commission),
        message: '無待沖銷預支',
      };
    }

    // 3. 依序沖銷
    let remainingCommission = parseFloat(event.calculated_commission);
    const offsets = [];

    for (const advance of pendingAdvances) {
      if (remainingCommission <= 0) break;

      const remaining = parseFloat(advance.remaining_to_offset);
      const offsetAmount = Math.min(remaining, remainingCommission);

      const newRemaining = Math.round((remaining - offsetAmount) * 100) / 100;
      const newStatus = newRemaining <= 0.01 ? 'fully_offset' : 'partially_offset';

      // 更新預支紀錄
      const { error: updateError } = await supabase
        .from('payout_advance_records')
        .update({
          remaining_to_offset: Math.max(0, newRemaining),
          offset_status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', advance.id);

      if (updateError) {
        console.error(`更新預支紀錄 ${advance.id} 失敗:`, updateError);
        continue;
      }

      remainingCommission = Math.round((remainingCommission - offsetAmount) * 100) / 100;

      offsets.push({
        advanceId: advance.id,
        offsetAmount,
        previousRemaining: remaining,
        newRemaining: Math.max(0, newRemaining),
        newStatus,
      });
    }

    const totalOffset = offsets.reduce((sum, o) => sum + o.offsetAmount, 0);

    // 4. 如果有沖銷，在分潤事件上加註
    if (totalOffset > 0) {
      const offsetNote = `已沖銷預支 NT$ ${totalOffset.toLocaleString()} (沖 ${offsets.length} 筆)`;
      await supabase
        .from('commission_events')
        .update({
          notes: event.notes
            ? `${event.notes} | ${offsetNote}`
            : offsetNote,
        })
        .eq('id', commissionEventId);
    }

    return {
      success: true,
      offsets,
      totalOffset,
      remainingCommission: Math.max(0, remainingCommission),
    };
  } catch (error) {
    console.error('預支沖銷錯誤:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 6. generateLaborReceiptFromEvent - 從分潤事件產生勞報單
// ============================================================

/**
 * Generate a labor receipt from a commission event.
 * Fixes the insurance calculation bug: 2.11% only applies when gross >= 20,000 TWD.
 * 從分潤事件產生勞報單：修正二代健保門檻（僅 >= 20,000 才扣）。
 *
 * @param {string} commissionEventId - 分潤事件 UUID
 * @returns {{ success: boolean, receiptId?: string, grossAmount?: number, taxAmount?: number, insuranceAmount?: number, netAmount?: number, error?: string }}
 */
export async function generateLaborReceiptFromEvent(commissionEventId) {
  try {
    if (!supabase) {
      return { success: false, error: 'Supabase 客戶端未初始化' };
    }
    if (!commissionEventId) {
      return { success: false, error: '缺少 commissionEventId' };
    }

    // 1. 取得分潤事件及關聯資料
    const { data: event, error: eventError } = await supabase
      .from('commission_events')
      .select('*')
      .eq('id', commissionEventId)
      .single();

    if (eventError || !event) {
      return { success: false, error: `找不到分潤事件: ${eventError?.message || '紀錄不存在'}` };
    }

    // 2. 取得專案資訊
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, project_name, project_code, client_name, sign_date, expected_completion_date')
      .eq('id', event.project_id)
      .single();

    if (projectError) {
      console.error('取得專案資訊失敗:', projectError);
    }

    // 3. 取得使用者資訊
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, email, mobile_number, national_id, registered_address, mailing_address, bank_name, bank_code, account_number, account_name')
      .eq('id', event.user_id)
      .single();

    if (userError) {
      console.error('取得使用者資訊失敗:', userError);
    }

    // 4. 計算勞報單金額
    const grossAmount = parseFloat(event.calculated_commission);

    // 扣繳稅額 10%
    const taxAmount = Math.round(grossAmount * TAX_WITHHOLDING_RATE * 100) / 100;

    // 二代健保 2.11% - 修正 Bug：僅 >= 20,000 才扣
    const insuranceAmount = grossAmount >= INSURANCE_THRESHOLD
      ? Math.round(grossAmount * INSURANCE_RATE * 100) / 100
      : 0;

    // 實發金額
    const netAmount = Math.round((grossAmount - taxAmount - insuranceAmount) * 100) / 100;

    // 5. 檢查是否已產生過勞報單（避免重複）
    const { data: existingReceipt } = await supabase
      .from('labor_receipts')
      .select('id')
      .eq('commission_id', commissionEventId)
      .maybeSingle();

    if (existingReceipt) {
      return {
        success: false,
        error: '此分潤事件已產生過勞報單',
        receiptId: existingReceipt.id,
      };
    }

    // 6. 建立勞報單
    const today = new Date().toISOString().split('T')[0];
    const receiptData = {
      project_id: event.project_id,
      user_id: event.user_id,
      commission_id: commissionEventId,

      receipt_date: today,
      period_start: project?.sign_date || today,
      period_end: project?.expected_completion_date || today,

      gross_amount: grossAmount,
      tax_amount: taxAmount,
      insurance_amount: insuranceAmount,
      net_amount: netAmount,

      project_name: project?.project_name || '',
      project_code: project?.project_code || '',
      client_name: project?.client_name || '',

      recipient_name: user?.name || '',
      recipient_id: user?.national_id || '',
      recipient_address: user?.registered_address || user?.mailing_address || '',
      recipient_phone: user?.mobile_number || '',
      bank_name: user?.bank_name || '',
      bank_code: user?.bank_code || '',
      account_number: user?.account_number || '',
      account_name: user?.account_name || '',

      status: 'issued',
      issued_at: new Date().toISOString(),

      notes: `V2 引擎自動產生 - 分潤事件 ${commissionEventId.substring(0, 8)}...`,
    };

    const { data: newReceipt, error: insertError } = await supabase
      .from('labor_receipts')
      .insert([receiptData])
      .select()
      .single();

    if (insertError) {
      throw new Error(`建立勞報單失敗: ${insertError.message}`);
    }

    // 7. 關聯勞報單到 finance_transactions（如果有）
    const { error: linkError } = await supabase
      .from('finance_transactions')
      .update({ labor_receipt_id: newReceipt.id })
      .eq('reference_type', 'commission_event')
      .eq('reference_id', commissionEventId);

    if (linkError) {
      console.error('關聯勞報單至交易紀錄失敗:', linkError);
    }

    return {
      success: true,
      receiptId: newReceipt.id,
      receiptNumber: newReceipt.receipt_number,
      grossAmount,
      taxAmount,
      insuranceAmount,
      netAmount,
      message: `勞報單已產生 (總額: NT$ ${grossAmount.toLocaleString()}, 實發: NT$ ${netAmount.toLocaleString()})`,
    };
  } catch (error) {
    console.error('從分潤事件產生勞報單錯誤:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 7. getCommissionSummary - 取得專案分潤總覽
// ============================================================

/**
 * Get a comprehensive commission summary for a project.
 * 取得專案分潤總覽：合約金額、收款、淨額、分潤、預支、已付、可付。
 *
 * @param {string} projectId - 專案 UUID
 * @returns {{ success: boolean, summary?: object, error?: string }}
 */
export async function getCommissionSummary(projectId) {
  try {
    if (!supabase) {
      return { success: false, error: 'Supabase 客戶端未初始化' };
    }
    if (!projectId) {
      return { success: false, error: '缺少 projectId' };
    }

    // 1. 取得專案基本資訊
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, project_name, project_code, client_name, amount')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return { success: false, error: `找不到專案: ${projectError?.message || '紀錄不存在'}` };
    }

    // 2. 取得合約資訊（如果有）
    const { data: contract } = await supabase
      .from('contracts')
      .select('contract_amount, tax_rate, is_tax_included, currency')
      .eq('project_id', projectId)
      .maybeSingle();

    const totalContractAmount = contract?.contract_amount || project.amount || 0;

    // 3. 取得所有分潤事件
    const { data: events, error: eventsError } = await supabase
      .from('commission_events')
      .select('*')
      .eq('project_id', projectId)
      .neq('status', 'cancelled');

    if (eventsError) {
      throw new Error(`查詢分潤事件失敗: ${eventsError.message}`);
    }

    const allEvents = events || [];
    const totalGrossReceived = allEvents.reduce((sum, e) => sum + parseFloat(e.gross_received || 0), 0);
    const totalNetReceived = allEvents.reduce((sum, e) => sum + parseFloat(e.net_received || 0), 0);
    const totalCommissionEarned = allEvents.reduce((sum, e) => sum + parseFloat(e.calculated_commission || 0), 0);

    // 4. 取得預支紀錄
    const { data: advances, error: advanceError } = await supabase
      .from('payout_advance_records')
      .select('*')
      .eq('project_id', projectId);

    if (advanceError) {
      console.error('查詢預支紀錄失敗:', advanceError);
    }

    const allAdvances = advances || [];
    const totalAdvanced = allAdvances.reduce((sum, a) => sum + parseFloat(a.advance_amount || 0), 0);
    const totalAdvanceRemaining = allAdvances.reduce((sum, a) => sum + parseFloat(a.remaining_to_offset || 0), 0);

    // 5. 取得已撥款紀錄（舊表 commission_payouts + 新表 finance_transactions）
    const { data: legacyPayouts } = await supabase
      .from('commission_payouts')
      .select('payout_amount')
      .eq('project_id', projectId)
      .eq('status', 'paid');

    const totalLegacyPaid = (legacyPayouts || []).reduce((sum, p) => sum + parseFloat(p.payout_amount || 0), 0);

    // 從 finance_transactions 取得已付分潤（去重：排除已計入 legacy 的部分）
    const { data: finTx } = await supabase
      .from('finance_transactions')
      .select('amount')
      .eq('project_id', projectId)
      .in('transaction_type', ['commission_payout', 'advance_payout']);

    const totalFinTxPaid = (finTx || []).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    // 取較大值以避免雙重計算（在過渡期可能兩邊都有紀錄）
    const totalPaidOut = Math.max(totalLegacyPaid, totalFinTxPaid);

    // 6. 計算可撥款金額
    const availableForPayout = Math.max(0, totalCommissionEarned - totalPaidOut);

    // 7. 按使用者分組
    const userBreakdown = {};
    for (const event of allEvents) {
      const uid = event.user_id;
      if (!userBreakdown[uid]) {
        userBreakdown[uid] = {
          userId: uid,
          totalGrossReceived: 0,
          totalNetReceived: 0,
          totalCommission: 0,
          eventCount: 0,
        };
      }
      userBreakdown[uid].totalGrossReceived += parseFloat(event.gross_received || 0);
      userBreakdown[uid].totalNetReceived += parseFloat(event.net_received || 0);
      userBreakdown[uid].totalCommission += parseFloat(event.calculated_commission || 0);
      userBreakdown[uid].eventCount += 1;
    }

    return {
      success: true,
      summary: {
        project: {
          id: project.id,
          name: project.project_name,
          code: project.project_code,
          clientName: project.client_name,
        },
        totalContractAmount,
        totalGrossReceived: Math.round(totalGrossReceived * 100) / 100,
        totalNetReceived: Math.round(totalNetReceived * 100) / 100,
        totalCommissionEarned: Math.round(totalCommissionEarned * 100) / 100,
        totalAdvanced: Math.round(totalAdvanced * 100) / 100,
        totalAdvanceRemaining: Math.round(totalAdvanceRemaining * 100) / 100,
        totalPaidOut: Math.round(totalPaidOut * 100) / 100,
        availableForPayout: Math.round(availableForPayout * 100) / 100,
        collectionRatio: totalContractAmount > 0
          ? Math.round((totalGrossReceived / totalContractAmount) * 10000) / 100
          : 0,
        eventCount: allEvents.length,
        userBreakdown: Object.values(userBreakdown),
        currency: contract?.currency || 'TWD',
      },
    };
  } catch (error) {
    console.error('取得專案分潤總覽錯誤:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 8. autoProcessPayment - 主入口：客戶付款自動處理
// ============================================================

/**
 * Main entry point when a customer payment is recorded.
 * Gets all commission rules for the project, creates commission events for each user,
 * offsets any pending advances, and returns the processing results.
 * 主入口：客戶付款時自動處理所有相關分潤。
 *
 * @param {string} projectId - 專案 UUID
 * @param {string} [paymentScheduleId=null] - 付款期程 UUID
 * @param {number} grossAmount - 客戶支付的含稅金額
 * @param {number} [taxRate=0.05] - 營業稅率
 * @returns {{ success: boolean, results?: Array, summary?: object, error?: string }}
 */
export async function autoProcessPayment(projectId, paymentScheduleId = null, grossAmount, taxRate = DEFAULT_TAX_RATE) {
  try {
    if (!supabase) {
      return { success: false, error: 'Supabase 客戶端未初始化' };
    }
    if (!projectId) {
      return { success: false, error: '缺少 projectId' };
    }
    if (typeof grossAmount !== 'number' || grossAmount <= 0) {
      return { success: false, error: '含稅金額必須為正數' };
    }

    // 1. 取得此專案的所有分潤規則
    const { data: rules, error: rulesError } = await supabase
      .from('commission_rules')
      .select('*')
      .eq('project_id', projectId);

    let userRules = rules || [];

    // 如果新表沒有規則，fallback 到舊表
    if (userRules.length === 0) {
      const { data: legacyCommissions, error: legacyError } = await supabase
        .from('commissions')
        .select('*')
        .eq('project_id', projectId);

      if (legacyError) {
        console.error('查詢舊分潤表失敗:', legacyError);
      }

      if (legacyCommissions && legacyCommissions.length > 0) {
        // 轉換舊格式為 user list
        userRules = legacyCommissions.map(c => ({
          user_id: c.user_id,
          _legacy: true,
        }));
      }
    }

    if (userRules.length === 0) {
      return {
        success: true,
        results: [],
        summary: {
          totalUsers: 0,
          totalCommission: 0,
          message: '此專案沒有設定分潤規則，無需處理',
        },
      };
    }

    // 2. 如果有 paymentScheduleId，更新付款排程狀態
    if (paymentScheduleId) {
      const { error: scheduleUpdateError } = await supabase
        .from('project_payment_schedules')
        .update({
          status: 'paid',
          actual_paid_amount: grossAmount,
          actual_paid_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentScheduleId);

      if (scheduleUpdateError) {
        console.error('更新付款排程狀態失敗:', scheduleUpdateError);
      }
    }

    // 3. 為每位使用者建立分潤事件
    const results = [];
    let totalCommissionGenerated = 0;

    for (const rule of userRules) {
      const userId = rule.user_id;

      const eventResult = await createCommissionEvent(projectId, userId, {
        grossReceived: grossAmount,
        taxRate,
        paymentScheduleId,
        triggerType: 'customer_payment',
        notes: paymentScheduleId
          ? `客戶付款 - 對應期程 ${paymentScheduleId.substring(0, 8)}...`
          : '客戶付款 - 手動觸發',
      });

      results.push({
        userId,
        ...eventResult,
      });

      if (eventResult.success) {
        totalCommissionGenerated += eventResult.summary?.calculatedCommission || 0;
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return {
      success: true,
      results,
      summary: {
        totalUsers: userRules.length,
        successCount,
        failCount,
        grossAmount,
        taxRate,
        totalCommissionGenerated: Math.round(totalCommissionGenerated * 100) / 100,
        paymentScheduleId,
        processedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('自動處理付款錯誤:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 內部輔助函式：為預支產生勞報單
// Internal helper: generate labor receipt for advance payout
// ============================================================

/**
 * Generate a labor receipt specifically for an advance payout.
 * 為預支撥款產生勞報單（內部輔助函式）。
 *
 * @param {string} projectId - 專案 UUID
 * @param {string} userId - 使用者 UUID
 * @param {number} amount - 預支金額
 * @param {string} advanceId - 預支紀錄 UUID
 * @returns {{ success: boolean, receiptId?: string, error?: string }}
 * @private
 */
async function generateLaborReceiptForAdvance(projectId, userId, amount, advanceId) {
  try {
    // 取得專案資訊
    const { data: project } = await supabase
      .from('projects')
      .select('id, project_name, project_code, client_name, sign_date, expected_completion_date')
      .eq('id', projectId)
      .maybeSingle();

    // 取得使用者資訊
    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, mobile_number, national_id, registered_address, mailing_address, bank_name, bank_code, account_number, account_name')
      .eq('id', userId)
      .maybeSingle();

    const grossAmount = amount;
    const taxAmount = Math.round(grossAmount * TAX_WITHHOLDING_RATE * 100) / 100;

    // 修正 Bug：二代健保僅 >= 20,000 才扣
    const insuranceAmount = grossAmount >= INSURANCE_THRESHOLD
      ? Math.round(grossAmount * INSURANCE_RATE * 100) / 100
      : 0;

    const netAmount = Math.round((grossAmount - taxAmount - insuranceAmount) * 100) / 100;

    const today = new Date().toISOString().split('T')[0];
    const receiptData = {
      project_id: projectId,
      user_id: userId,

      receipt_date: today,
      period_start: project?.sign_date || today,
      period_end: project?.expected_completion_date || today,

      gross_amount: grossAmount,
      tax_amount: taxAmount,
      insurance_amount: insuranceAmount,
      net_amount: netAmount,

      project_name: project?.project_name || '',
      project_code: project?.project_code || '',
      client_name: project?.client_name || '',

      recipient_name: user?.name || '',
      recipient_id: user?.national_id || '',
      recipient_address: user?.registered_address || user?.mailing_address || '',
      recipient_phone: user?.mobile_number || '',
      bank_name: user?.bank_name || '',
      bank_code: user?.bank_code || '',
      account_number: user?.account_number || '',
      account_name: user?.account_name || '',

      status: 'issued',
      issued_at: new Date().toISOString(),

      notes: `V2 引擎自動產生 - 預支撥款 ${advanceId.substring(0, 8)}...`,
    };

    const { data: newReceipt, error: insertError } = await supabase
      .from('labor_receipts')
      .insert([receiptData])
      .select()
      .single();

    if (insertError) {
      throw new Error(`建立預支勞報單失敗: ${insertError.message}`);
    }

    return {
      success: true,
      receiptId: newReceipt.id,
      receiptNumber: newReceipt.receipt_number,
      grossAmount,
      taxAmount,
      insuranceAmount,
      netAmount,
    };
  } catch (error) {
    console.error('產生預支勞報單錯誤:', error);
    return { success: false, error: error.message };
  }
}
