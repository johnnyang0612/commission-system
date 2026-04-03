// 群組成員模糊查找工具
// 支援：精確匹配、模糊匹配、暱稱、部分名字、不區分大小寫

import { supabase } from './supabaseClient';

/**
 * 在群組中模糊搜尋成員
 * @param {string} name - 輸入的名字（可能是暱稱、全名、部分名字）
 * @param {string} groupId - LINE 群組 ID（可選，限制搜尋範圍）
 * @returns {Object|null} { lineUserId, displayName, realName, email, userId }
 */
export async function findMemberByName(name, groupId = null) {
  if (!name || !supabase) return null;

  const cleanName = name.replace(/^@/, '').trim();
  if (!cleanName) return null;

  // === 策略 1: 精確匹配 contact_identities ===
  const { data: exactMatch } = await supabase
    .from('contact_identities')
    .select('line_user_id, display_name, real_name, email, internal_user_id')
    .or(`display_name.eq.${cleanName},real_name.eq.${cleanName}`)
    .limit(1)
    .single();

  if (exactMatch) return formatResult(exactMatch);

  // === 策略 2: 不區分大小寫匹配 ===
  const { data: iMatch } = await supabase
    .from('contact_identities')
    .select('line_user_id, display_name, real_name, email, internal_user_id')
    .or(`display_name.ilike.${cleanName},real_name.ilike.${cleanName}`)
    .limit(1)
    .single();

  if (iMatch) return formatResult(iMatch);

  // === 策略 3: 模糊匹配（包含關係）===
  const { data: fuzzyMatches } = await supabase
    .from('contact_identities')
    .select('line_user_id, display_name, real_name, email, internal_user_id')
    .or(`display_name.ilike.%${cleanName}%,real_name.ilike.%${cleanName}%`)
    .limit(5);

  if (fuzzyMatches?.length === 1) return formatResult(fuzzyMatches[0]);

  // 多筆結果時，優先選有 line_user_id 的
  if (fuzzyMatches?.length > 1) {
    const withLine = fuzzyMatches.find(m => m.line_user_id);
    if (withLine) return formatResult(withLine);
    return formatResult(fuzzyMatches[0]);
  }

  // === 策略 4: 查 users 表 ===
  const { data: userMatch } = await supabase
    .from('users')
    .select('id, name, email, line_user_id')
    .or(`name.ilike.%${cleanName}%`)
    .limit(1)
    .single();

  if (userMatch) {
    return {
      lineUserId: userMatch.line_user_id,
      displayName: userMatch.name,
      realName: userMatch.name,
      email: userMatch.email,
      userId: userMatch.id
    };
  }

  // === 策略 5: 群組內搜尋 ===
  if (groupId) {
    const { data: groupMembers } = await supabase
      .from('group_participants')
      .select('identity:identity_id(line_user_id, display_name, real_name, email, internal_user_id)')
      .eq('line_group_id', groupId);

    if (groupMembers) {
      const lowerName = cleanName.toLowerCase();
      const match = groupMembers.find(m => {
        const dn = (m.identity?.display_name || '').toLowerCase();
        const rn = (m.identity?.real_name || '').toLowerCase();
        return dn.includes(lowerName) || rn.includes(lowerName) || lowerName.includes(dn) || lowerName.includes(rn);
      });
      if (match?.identity) return formatResult(match.identity);
    }
  }

  console.log(`🔍 找不到成員: ${cleanName}`);
  return null;
}

/**
 * 解析參與者列表 — 支援「所有人」、指名、@標記
 * @param {Array} participants - [{name: '王經理'}, {name: '所有人'}]
 * @param {string} groupId - LINE 群組 ID
 * @returns {Object} { lineUserIds, names, emails, isAll }
 */
export async function resolveParticipants(participants, groupId) {
  const result = {
    lineUserIds: [],
    names: [],
    emails: [],
    isAll: false,
    unresolved: []
  };

  if (!participants || participants.length === 0) {
    result.isAll = true;
  }

  // 檢查是否為「所有人」
  const allKeywords = ['所有人', '大家', '全部', 'all', 'everyone'];
  if (participants?.some(p => allKeywords.includes((p.name || p || '').toString().toLowerCase()))) {
    result.isAll = true;
  }

  if (result.isAll && groupId) {
    // 取群組所有成員
    const { data: members } = await supabase
      .from('group_participants')
      .select('identity:identity_id(line_user_id, display_name, real_name, email)')
      .eq('line_group_id', groupId);

    if (members) {
      for (const m of members) {
        if (m.identity?.line_user_id) {
          result.lineUserIds.push(m.identity.line_user_id);
          result.names.push(m.identity.real_name || m.identity.display_name);
        }
        if (m.identity?.email) {
          result.emails.push(m.identity.email);
        }
      }
    }

    // 也加入系統管理員
    const { data: admins } = await supabase
      .from('users')
      .select('id, name, email, line_user_id')
      .eq('role', 'admin')
      .not('line_user_id', 'is', null);

    admins?.forEach(a => {
      if (a.line_user_id && !result.lineUserIds.includes(a.line_user_id)) {
        result.lineUserIds.push(a.line_user_id);
        result.names.push(a.name);
      }
      if (a.email && !result.emails.includes(a.email)) {
        result.emails.push(a.email);
      }
    });

    return result;
  }

  // 逐個解析指名的參與者
  for (const p of (participants || [])) {
    const name = (p.name || p || '').toString().trim();
    if (!name) continue;

    const found = await findMemberByName(name, groupId);
    if (found) {
      if (found.lineUserId) result.lineUserIds.push(found.lineUserId);
      result.names.push(found.realName || found.displayName || name);
      if (found.email) result.emails.push(found.email);
    } else {
      result.unresolved.push(name);
    }
  }

  return result;
}

function formatResult(identity) {
  return {
    lineUserId: identity.line_user_id,
    displayName: identity.display_name,
    realName: identity.real_name,
    email: identity.email,
    userId: identity.internal_user_id
  };
}
