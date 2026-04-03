// 保固到期 + 維護費自動啟動 Cron Job
// 每天 UTC 01:00 執行，檢查保固狀態並自動啟動維護計畫

import { supabase } from '../../../utils/supabaseClient';

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
    warranties_activated: 0,
    warranties_expired: 0,
    maintenance_activated: 0,
    errors: []
  };

  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // ================================================
    // Step 1: 啟動已到開始日期的待啟動保固
    // 狀態為 pending 且 start_date <= 今天
    // ================================================
    const { data: pendingWarranties, error: pendingError } = await supabase
      .from('project_warranties')
      .select('id, project_id, start_date, end_date')
      .eq('status', 'pending')
      .not('start_date', 'is', null)
      .lte('start_date', today);

    if (pendingError) {
      console.error('查詢待啟動保固失敗:', pendingError);
      results.errors.push({ step: 'activate_warranties', error: pendingError.message });
    } else if (pendingWarranties && pendingWarranties.length > 0) {
      const ids = pendingWarranties.map(w => w.id);
      const { error: updateError } = await supabase
        .from('project_warranties')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .in('id', ids);

      if (updateError) {
        console.error('啟動保固失敗:', updateError);
        results.errors.push({ step: 'activate_warranties', error: updateError.message });
      } else {
        results.warranties_activated = ids.length;
        console.log(`已啟動 ${ids.length} 筆保固`);
      }
    }

    // ================================================
    // Step 2: 到期活躍保固
    // 狀態為 active 且 end_date < 今天
    // ================================================
    const { data: expiringWarranties, error: expiringError } = await supabase
      .from('project_warranties')
      .select('id, project_id, end_date')
      .eq('status', 'active')
      .not('end_date', 'is', null)
      .lt('end_date', today);

    if (expiringError) {
      console.error('查詢到期保固失敗:', expiringError);
      results.errors.push({ step: 'expire_warranties', error: expiringError.message });
    } else if (expiringWarranties && expiringWarranties.length > 0) {
      const ids = expiringWarranties.map(w => w.id);
      const { error: updateError } = await supabase
        .from('project_warranties')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .in('id', ids);

      if (updateError) {
        console.error('過期保固更新失敗:', updateError);
        results.errors.push({ step: 'expire_warranties', error: updateError.message });
      } else {
        results.warranties_expired = ids.length;
        console.log(`已過期 ${ids.length} 筆保固`);
      }

      // ================================================
      // Step 3: 自動啟動保固結束後的維護計畫
      // 對剛過期的保固，找到 start_rule='warranty_end' 且 status='pending' 的維護計畫
      // ================================================
      for (const warranty of expiringWarranties) {
        try {
          const { data: plan, error: planError } = await supabase
            .from('project_maintenance_plans')
            .select('id, project_id, monthly_fee')
            .eq('project_id', warranty.project_id)
            .eq('start_rule', 'warranty_end')
            .eq('status', 'pending')
            .eq('enabled', true)
            .single();

          if (planError && planError.code !== 'PGRST116') {
            // PGRST116 = no rows returned，不算錯誤
            console.error('查詢維護計畫失敗:', planError);
            results.errors.push({
              step: 'find_maintenance_plan',
              project_id: warranty.project_id,
              error: planError.message
            });
            continue;
          }

          if (plan) {
            // 維護開始日 = 保固結束日 + 1 天
            const maintenanceStartDate = new Date(warranty.end_date);
            maintenanceStartDate.setDate(maintenanceStartDate.getDate() + 1);
            const startDateStr = maintenanceStartDate.toISOString().split('T')[0];

            const { error: activateError } = await supabase
              .from('project_maintenance_plans')
              .update({
                status: 'active',
                start_date: startDateStr,
                updated_at: new Date().toISOString()
              })
              .eq('id', plan.id);

            if (activateError) {
              console.error('啟動維護計畫失敗:', activateError);
              results.errors.push({
                step: 'activate_maintenance',
                plan_id: plan.id,
                error: activateError.message
              });
            } else {
              results.maintenance_activated++;
              console.log(`已啟動維護計畫 ${plan.id}，專案 ${warranty.project_id}，開始日 ${startDateStr}`);
            }
          }
        } catch (e) {
          console.error('處理維護計畫時發生錯誤:', e);
          results.errors.push({
            step: 'activate_maintenance',
            project_id: warranty.project_id,
            error: e.message
          });
        }
      }
    }

    // ================================================
    // Step 4: 啟動固定日期的維護計畫
    // start_rule='fixed_date' 且 start_date <= 今天 且 status='pending'
    // ================================================
    const { data: fixedDatePlans, error: fixedError } = await supabase
      .from('project_maintenance_plans')
      .select('id, project_id')
      .eq('start_rule', 'fixed_date')
      .eq('status', 'pending')
      .eq('enabled', true)
      .not('start_date', 'is', null)
      .lte('start_date', today);

    if (fixedError) {
      console.error('查詢固定日期維護計畫失敗:', fixedError);
      results.errors.push({ step: 'activate_fixed_date_plans', error: fixedError.message });
    } else if (fixedDatePlans && fixedDatePlans.length > 0) {
      const ids = fixedDatePlans.map(p => p.id);
      const { error: updateError } = await supabase
        .from('project_maintenance_plans')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .in('id', ids);

      if (updateError) {
        console.error('啟動固定日期維護計畫失敗:', updateError);
        results.errors.push({ step: 'activate_fixed_date_plans', error: updateError.message });
      } else {
        results.maintenance_activated += ids.length;
        console.log(`已啟動 ${ids.length} 筆固定日期維護計畫`);
      }
    }

    // ================================================
    // Step 5: 記錄執行結果
    // ================================================
    console.log('保固/維護 Cron 執行結果:', JSON.stringify(results));

    return res.status(200).json({ success: true, ...results });

  } catch (error) {
    console.error('保固/維護 Cron 執行錯誤:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
