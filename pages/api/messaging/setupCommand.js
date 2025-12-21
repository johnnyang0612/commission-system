// 群組設定指令處理
// 當在群組輸入 /設定 指令時，自動配置群組

import { supabase } from '../../../utils/supabaseClient';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// 指令格式:
// /設定 負責人=王小明 洽談=ABC公司 專案=PRJ001 類型=prospect
// 或簡單格式:
// /設定 @王小明
export async function handleSetupCommand(text, groupId, replyToken) {
  // 檢查是否是設定指令
  if (!text.startsWith('/設定') && !text.startsWith('/setup')) {
    return false;
  }

  console.log('收到設定指令:', text);

  const settings = {};
  const messages = [];

  // 解析指令參數
  const content = text.replace(/^\/(設定|setup)\s*/, '');

  // 解析 負責人/owner
  const ownerMatch = content.match(/(?:負責人|owner)[=:\s]+([^\s,]+)/i)
    || content.match(/@(\S+)/);

  // 解析 洽談/prospect
  const prospectMatch = content.match(/(?:洽談|prospect|客戶)[=:\s]+([^\s,]+)/i);

  // 解析 專案/project
  const projectMatch = content.match(/(?:專案|project)[=:\s]+([^\s,]+)/i);

  // 解析 類型/type
  const typeMatch = content.match(/(?:類型|type)[=:\s]+([^\s,]+)/i);

  // 查找負責人
  if (ownerMatch) {
    const ownerName = ownerMatch[1];
    const { data: users } = await supabase
      .from('users')
      .select('id, name')
      .ilike('name', `%${ownerName}%`)
      .limit(1);

    if (users && users.length > 0) {
      settings.owner_user_id = users[0].id;
      messages.push(`✅ 負責人: ${users[0].name}`);
    } else {
      messages.push(`⚠️ 找不到員工「${ownerName}」`);
    }
  }

  // 查找洽談案
  if (prospectMatch) {
    const prospectName = prospectMatch[1];
    const { data: prospects } = await supabase
      .from('prospects')
      .select('id, client_name, project_name')
      .or(`client_name.ilike.%${prospectName}%,project_name.ilike.%${prospectName}%`)
      .limit(1);

    if (prospects && prospects.length > 0) {
      settings.prospect_id = prospects[0].id;
      settings.group_type = 'prospect';
      messages.push(`✅ 洽談案: ${prospects[0].client_name} / ${prospects[0].project_name}`);
    } else {
      // 如果找不到，自動建立新洽談案
      const { data: newProspect, error } = await supabase
        .from('prospects')
        .insert({
          client_name: prospectName,
          project_name: '新案件',
          stage: 'initial_contact',
          source: 'LINE群組'
        })
        .select()
        .single();

      if (!error && newProspect) {
        settings.prospect_id = newProspect.id;
        settings.group_type = 'prospect';
        messages.push(`✅ 已建立新洽談案: ${prospectName}`);
      } else {
        messages.push(`⚠️ 無法建立洽談案「${prospectName}」`);
      }
    }
  }

  // 查找專案
  if (projectMatch) {
    const projectCode = projectMatch[1];
    const { data: projects } = await supabase
      .from('projects')
      .select('id, project_code, client_name')
      .or(`project_code.ilike.%${projectCode}%,client_name.ilike.%${projectCode}%`)
      .limit(1);

    if (projects && projects.length > 0) {
      settings.project_id = projects[0].id;
      settings.group_type = settings.group_type || 'project';
      messages.push(`✅ 專案: ${projects[0].project_code} - ${projects[0].client_name}`);
    } else {
      messages.push(`⚠️ 找不到專案「${projectCode}」`);
    }
  }

  // 設定類型
  if (typeMatch) {
    const typeMap = {
      '客戶': 'prospect', 'prospect': 'prospect', '洽談': 'prospect',
      '內部': 'internal', 'internal': 'internal',
      '團隊': 'team', 'team': 'team',
      '專案': 'project', 'project': 'project',
      '其他': 'other', 'other': 'other'
    };
    const mappedType = typeMap[typeMatch[1].toLowerCase()];
    if (mappedType) {
      settings.group_type = mappedType;
      messages.push(`✅ 類型: ${typeMatch[1]}`);
    }
  }

  // 更新群組設定
  if (Object.keys(settings).length > 0) {
    const { error } = await supabase
      .from('line_groups')
      .update(settings)
      .eq('group_id', groupId);

    if (error) {
      console.error('更新群組失敗:', error);
      messages.push('❌ 更新失敗: ' + error.message);
    } else {
      messages.unshift('🎉 群組設定完成！');
    }
  } else {
    messages.push('ℹ️ 沒有需要更新的設定');
    messages.push('');
    messages.push('📖 指令格式:');
    messages.push('/設定 @負責人姓名');
    messages.push('/設定 負責人=王小明 洽談=ABC公司');
    messages.push('/設定 專案=PRJ001 類型=專案');
  }

  // 發送回覆
  if (replyToken) {
    await replyMessage(replyToken, messages.join('\n'));
  }

  return true;
}

async function replyMessage(replyToken, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.warn('缺少 LINE_CHANNEL_ACCESS_TOKEN');
    return;
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken,
        messages: [{
          type: 'text',
          text: text
        }]
      })
    });

    if (!response.ok) {
      console.error('回覆失敗:', await response.text());
    }
  } catch (error) {
    console.error('發送回覆錯誤:', error);
  }
}
