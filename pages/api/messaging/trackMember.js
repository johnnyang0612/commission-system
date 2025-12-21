// 追蹤群組成員
// 當員工在群組發訊息時，自動記錄並偵測角色

import { supabase } from '../../../utils/supabaseClient';

export async function trackGroupMember(groupId, lineUserId, senderType) {
  // 只追蹤員工
  if (senderType !== 'staff') return null;

  try {
    // 查找員工資料
    const { data: user } = await supabase
      .from('users')
      .select('id, name, role, roles')
      .eq('line_user_id', lineUserId)
      .single();

    if (!user) {
      console.log('找不到員工資料:', lineUserId);
      return null;
    }

    // 取得用戶所有角色
    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];

    // 檢查是否已存在
    const { data: existing } = await supabase
      .from('line_group_members')
      .select('id, is_project_owner')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      // 更新最後活動時間
      await supabase
        .from('line_group_members')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', existing.id);

      return { user, isNew: false, isProjectOwner: existing.is_project_owner };
    }

    // 新成員，判斷是否應該自動設為 PO
    let shouldBeOwner = false;

    // 如果是業務且群組尚無 PO，自動設為 PO
    if (userRoles.includes('sales')) {
      const { data: currentOwner } = await supabase
        .from('line_groups')
        .select('owner_user_id')
        .eq('group_id', groupId)
        .single();

      if (!currentOwner?.owner_user_id) {
        shouldBeOwner = true;

        // 更新群組的 owner_user_id
        await supabase
          .from('line_groups')
          .update({ owner_user_id: user.id })
          .eq('group_id', groupId);

        console.log(`自動設定 ${user.name} 為群組 PO (業務偵測)`);
      }
    }

    // 新增成員記錄
    await supabase
      .from('line_group_members')
      .insert({
        group_id: groupId,
        user_id: user.id,
        line_user_id: lineUserId,
        role: user.role,
        is_project_owner: shouldBeOwner
      });

    console.log(`記錄群組成員: ${user.name} (${user.role})`);

    return { user, isNew: true, isProjectOwner: shouldBeOwner };

  } catch (error) {
    console.error('追蹤群組成員失敗:', error);
    return null;
  }
}

// 取得群組所有員工的 LINE ID（用於發送通知）
export async function getGroupStaffLineIds(groupId) {
  try {
    const { data: members } = await supabase
      .from('line_group_members')
      .select(`
        line_user_id,
        user_id,
        role,
        is_project_owner,
        users:user_id(name, role)
      `)
      .eq('group_id', groupId);

    if (!members || members.length === 0) {
      return [];
    }

    // 回傳所有有 LINE ID 的員工
    return members
      .filter(m => m.line_user_id)
      .map(m => ({
        lineUserId: m.line_user_id,
        userId: m.user_id,
        role: m.role,
        isProjectOwner: m.is_project_owner,
        name: m.users?.name
      }));

  } catch (error) {
    console.error('取得群組員工失敗:', error);
    return [];
  }
}
