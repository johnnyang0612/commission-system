// 維護費帳單產生 Cron Job
// 每月 1 日 UTC 02:00 執行，為活躍維護計畫產生當期帳單

import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';

export default async function handler(req, res) {
  // 驗證 cron secret
  const cronSecret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabase) {
    return res.status(500).json({ success: false, error: '缺少 Supabase 設定' });
  }

  const results = {
    plans_checked: 0,
    billed: 0,
    skipped: 0,
    errors: []
  };

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const currentQuarter = Math.ceil(currentMonth / 3);

    // 取得所有啟用中的維護計畫
    const { data: plans, error: plansError } = await supabase
      .from('project_maintenance_plans')
      .select('*, projects:project_id(client_name, project_name, project_code)')
      .eq('status', 'active')
      .eq('enabled', true);

    if (plansError) {
      console.error('查詢維護計畫失敗:', plansError);
      return res.status(500).json({ success: false, error: plansError.message });
    }

    results.plans_checked = plans?.length || 0;
    console.log(`找到 ${results.plans_checked} 筆啟用中的維護計畫`);

    for (const plan of plans || []) {
      try {
        let shouldBill = false;
        let periodLabel = '';
        let billingAmount = plan.monthly_fee || 0;

        // 根據計費週期判斷是否需要開帳單
        if (plan.billing_cycle === 'monthly') {
          // 月繳：檢查本月是否已有帳單
          const monthStart = `${currentMonthStr}-01`;
          const nextMonth = currentMonth === 12
            ? `${currentYear + 1}-01-01`
            : `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;

          const { count, error: countError } = await supabase
            .from('finance_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', plan.project_id)
            .eq('transaction_type', 'maintenance_income')
            .gte('transaction_date', monthStart)
            .lt('transaction_date', nextMonth);

          if (countError) {
            results.errors.push({ plan_id: plan.id, error: countError.message });
            continue;
          }

          shouldBill = count === 0;
          periodLabel = `${currentMonthStr}`;

        } else if (plan.billing_cycle === 'quarterly') {
          // 季繳：檢查本季是否已有帳單（只在季初月份開帳單）
          const quarterStartMonth = (currentQuarter - 1) * 3 + 1;
          if (currentMonth !== quarterStartMonth) {
            results.skipped++;
            continue; // 非季初月份，跳過
          }

          const quarterStart = `${currentYear}-${String(quarterStartMonth).padStart(2, '0')}-01`;
          const quarterEndMonth = quarterStartMonth + 3;
          const quarterEnd = quarterEndMonth > 12
            ? `${currentYear + 1}-01-01`
            : `${currentYear}-${String(quarterEndMonth).padStart(2, '0')}-01`;

          const { count, error: countError } = await supabase
            .from('finance_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', plan.project_id)
            .eq('transaction_type', 'maintenance_income')
            .gte('transaction_date', quarterStart)
            .lt('transaction_date', quarterEnd);

          if (countError) {
            results.errors.push({ plan_id: plan.id, error: countError.message });
            continue;
          }

          shouldBill = count === 0;
          billingAmount = (plan.monthly_fee || 0) * 3;
          periodLabel = `${currentYear} Q${currentQuarter}`;

        } else if (plan.billing_cycle === 'yearly') {
          // 年繳：檢查今年是否已有帳單（只在 1 月開帳單）
          if (currentMonth !== 1) {
            results.skipped++;
            continue; // 非 1 月，跳過
          }

          const yearStart = `${currentYear}-01-01`;
          const yearEnd = `${currentYear + 1}-01-01`;

          const { count, error: countError } = await supabase
            .from('finance_transactions')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', plan.project_id)
            .eq('transaction_type', 'maintenance_income')
            .gte('transaction_date', yearStart)
            .lt('transaction_date', yearEnd);

          if (countError) {
            results.errors.push({ plan_id: plan.id, error: countError.message });
            continue;
          }

          shouldBill = count === 0;
          billingAmount = (plan.monthly_fee || 0) * 12;
          periodLabel = `${currentYear}`;
        }

        if (!shouldBill) {
          results.skipped++;
          continue;
        }

        if (billingAmount <= 0) {
          console.log(`維護計畫 ${plan.id} 金額為 0，跳過`);
          results.skipped++;
          continue;
        }

        // 建立帳單交易紀錄
        const clientName = plan.projects?.client_name || '未知客戶';
        const projectName = plan.projects?.project_name || '';
        const description = `維護費 - ${clientName}${projectName ? ` - ${projectName}` : ''} - ${periodLabel}`;

        const { error: insertError } = await supabase
          .from('finance_transactions')
          .insert([{
            project_id: plan.project_id,
            transaction_type: 'maintenance_income',
            amount: billingAmount,
            currency: 'TWD',
            description: description,
            reference_type: 'project_maintenance_plans',
            reference_id: plan.id,
            transaction_date: now.toISOString().split('T')[0],
            needs_labor_receipt: false
          }]);

        if (insertError) {
          console.error(`建立帳單失敗 (計畫 ${plan.id}):`, insertError);
          results.errors.push({ plan_id: plan.id, error: insertError.message });
        } else {
          results.billed++;
          console.log(`已建立帳單: ${description}, 金額 ${billingAmount}`);
        }

      } catch (e) {
        console.error(`處理維護計畫 ${plan.id} 時發生錯誤:`, e);
        results.errors.push({ plan_id: plan.id, error: e.message });
      }
    }

    console.log('維護費帳單 Cron 執行結果:', JSON.stringify(results));
    return res.status(200).json({ success: true, ...results });

  } catch (error) {
    console.error('維護費帳單 Cron 執行錯誤:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
