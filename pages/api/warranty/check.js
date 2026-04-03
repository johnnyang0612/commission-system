// 保固/維護狀態診斷端點
// 提供管理員手動檢查保固到期狀態與維護計畫啟動情形

import { supabase } from '../../../utils/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '只支援 GET 方法' });
  }

  if (!supabase) {
    return res.status(500).json({ success: false, error: '缺少 Supabase 設定' });
  }

  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // 取得所有保固紀錄
    const { data: warranties, error: warrantyError } = await supabase
      .from('project_warranties')
      .select('*, projects:project_id(client_name, project_name, project_code)')
      .order('end_date', { ascending: true });

    if (warrantyError) {
      return res.status(500).json({ success: false, error: warrantyError.message });
    }

    // 取得所有維護計畫
    const { data: maintenancePlans, error: planError } = await supabase
      .from('project_maintenance_plans')
      .select('*, projects:project_id(client_name, project_name, project_code)')
      .order('start_date', { ascending: true });

    if (planError) {
      return res.status(500).json({ success: false, error: planError.message });
    }

    // 分類保固狀態
    const pending = warranties?.filter(w => w.status === 'pending') || [];
    const active = warranties?.filter(w => w.status === 'active') || [];
    const expired = warranties?.filter(w => w.status === 'expired') || [];

    // 即將到期的保固（30 天內）
    const expiringSoon = (warranties || []).filter(w => {
      if (w.status !== 'active' || !w.end_date) return false;
      const daysUntilExpiry = Math.ceil(
        (new Date(w.end_date) - now) / (1000 * 60 * 60 * 24)
      );
      return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
    });

    // 已到期但狀態未更新的（應由 cron 處理）
    const shouldBeExpired = (warranties || []).filter(w => {
      return w.status === 'active' && w.end_date && w.end_date < today;
    });

    // 應該啟動但尚未啟動的保固
    const shouldBeActivated = (warranties || []).filter(w => {
      return w.status === 'pending' && w.start_date && w.start_date <= today;
    });

    // 分類維護計畫狀態
    const plansPending = maintenancePlans?.filter(m => m.status === 'pending') || [];
    const plansActive = maintenancePlans?.filter(m => m.status === 'active') || [];
    const plansPaused = maintenancePlans?.filter(m => m.status === 'paused') || [];
    const plansEnded = maintenancePlans?.filter(m => m.status === 'ended') || [];

    // 待自動啟動的維護計畫（保固結束後）
    const pendingWarrantyEnd = (maintenancePlans || []).filter(m => {
      return m.status === 'pending' && m.start_rule === 'warranty_end' && m.enabled;
    });

    // 待固定日期啟動的維護計畫
    const pendingFixedDate = (maintenancePlans || []).filter(m => {
      return m.status === 'pending' && m.start_rule === 'fixed_date' && m.enabled && m.start_date && m.start_date <= today;
    });

    return res.status(200).json({
      success: true,
      checked_at: now.toISOString(),
      warranties: {
        total: warranties?.length || 0,
        pending: pending.length,
        active: active.length,
        expired: expired.length,
        expiring_soon_30d: expiringSoon.length,
        needs_attention: {
          should_be_expired: shouldBeExpired.length,
          should_be_activated: shouldBeActivated.length
        }
      },
      maintenance: {
        total: maintenancePlans?.length || 0,
        pending: plansPending.length,
        active: plansActive.length,
        paused: plansPaused.length,
        ended: plansEnded.length,
        pending_warranty_end: pendingWarrantyEnd.length,
        pending_fixed_date_overdue: pendingFixedDate.length
      },
      expiring_soon: expiringSoon.map(w => ({
        id: w.id,
        project_id: w.project_id,
        client_name: w.projects?.client_name,
        project_name: w.projects?.project_name,
        end_date: w.end_date,
        days_remaining: Math.ceil((new Date(w.end_date) - now) / (1000 * 60 * 60 * 24))
      })),
      needs_attention: {
        should_be_expired: shouldBeExpired.map(w => ({
          id: w.id,
          project_id: w.project_id,
          client_name: w.projects?.client_name,
          end_date: w.end_date
        })),
        should_be_activated: shouldBeActivated.map(w => ({
          id: w.id,
          project_id: w.project_id,
          client_name: w.projects?.client_name,
          start_date: w.start_date
        })),
        pending_fixed_date_overdue: pendingFixedDate.map(m => ({
          id: m.id,
          project_id: m.project_id,
          client_name: m.projects?.client_name,
          start_date: m.start_date
        }))
      },
      all_warranties: warranties,
      all_maintenance: maintenancePlans
    });

  } catch (error) {
    console.error('保固/維護診斷錯誤:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
