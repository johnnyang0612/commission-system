// 任務提醒指令處理
// 支援建立、取消、查看提醒

import { supabase } from '../../../utils/supabaseClient';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

/**
 * 處理建立提醒指令
 * @param {string} text - 使用者輸入的原始文字
 * @param {string} groupId - LINE 群組 ID
 * @param {string} userId - LINE 使用者 ID
 * @param {string} senderName - 發送者顯示名稱
 * @param {string} replyToken - LINE reply token
 */
export async function handleReminderCommand(text, groupId, userId, senderName, replyToken) {
  // 1. Use Claude AI to parse the reminder
  const parsed = await parseReminderWithAI(text);

  if (!parsed || !parsed.remind_at || !parsed.message) {
    await reply(replyToken, '❓ 無法解析提醒\n\n用法範例：\n/提醒 明天下午3點 跟客戶確認需求\n/提醒 下周五前 提供合約\n/提醒 今天18:00 提供發票\n\n也可以自然語言：\n「提醒我明天要交報告」\n「下周一早上提醒準備會議資料」');
    return { success: false };
  }

  // 2. Determine who to mention
  // Default: mention the creator. If text mentions @someone, mention them instead.
  let mentionLineIds = [userId];
  let mentionNames = [senderName || '建立者'];

  if (parsed.mention_others && parsed.mention_others.length > 0) {
    // Look up mentioned people in contact_identities
    for (const name of parsed.mention_others) {
      try {
        const { data: identity } = await supabase
          .from('contact_identities')
          .select('line_user_id, display_name, real_name')
          .or(`display_name.ilike.%${name}%,real_name.ilike.%${name}%`)
          .single();
        if (identity?.line_user_id) {
          mentionLineIds.push(identity.line_user_id);
          mentionNames.push(identity.real_name || identity.display_name);
        }
      } catch (e) {
        console.log(`查找提醒對象失敗: ${name}`, e.message);
      }
    }
  }

  if (parsed.mention_all) {
    // Get all group members
    try {
      const { data: members } = await supabase
        .from('group_participants')
        .select('identity:identity_id(line_user_id, display_name, real_name)')
        .eq('line_group_id', groupId);
      if (members && members.length > 0) {
        mentionLineIds = members.filter(m => m.identity?.line_user_id).map(m => m.identity.line_user_id);
        mentionNames = members.filter(m => m.identity?.line_user_id).map(m => m.identity.real_name || m.identity.display_name);
      }
    } catch (e) {
      console.log('取得群組成員失敗:', e.message);
    }
  }

  // 3. Look up creator user_id
  let creatorUserId = null;
  if (userId) {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('line_user_id', userId)
        .single();
      if (user) creatorUserId = user.id;
    } catch (e) {
      // Non-critical
    }
  }

  // 4. Insert reminder
  const { data: reminder, error } = await supabase
    .from('task_reminders')
    .insert([{
      group_id: groupId,
      created_by_line_id: userId,
      created_by_user_id: creatorUserId,
      remind_at: parsed.remind_at,
      message: parsed.message,
      mention_line_ids: mentionLineIds,
      mention_names: mentionNames
    }])
    .select()
    .single();

  if (error) {
    console.error('建立提醒失敗:', error);
    await reply(replyToken, `❌ 建立提醒失敗: ${error.message}`);
    return { success: false };
  }

  // 5. Reply with confirmation
  const fireDate = new Date(parsed.remind_at);
  const fireTimeStr = fireDate.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: 'numeric', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  });

  const whoText = mentionNames.join(', ');

  let confirmText = `⏰ 提醒已建立！\n\n`;
  confirmText += `📋 內容：${parsed.message}\n`;
  confirmText += `🕐 提醒時間：${fireTimeStr}\n`;
  confirmText += `👤 提醒對象：${whoText}`;

  await reply(replyToken, confirmText);

  // 6. Log
  try {
    const { logAssistantAction } = await import('../../../utils/assistantLogger.js');
    await logAssistantAction({
      actorUserId: creatorUserId,
      channel: 'line_group',
      sourceGroupId: groupId,
      commandType: 'create_reminder',
      rawInput: text,
      parsedIntent: parsed,
      resultStatus: 'success',
      resultData: { reminder_id: reminder.id }
    });
  } catch (e) {
    // Non-critical
  }

  return { success: true, reminder };
}

/**
 * Use Claude AI to parse reminder from natural language
 */
async function parseReminderWithAI(text) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('缺少 ANTHROPIC_API_KEY，無法解析提醒');
    return null;
  }

  const now = new Date();
  const taipeiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const todayStr = taipeiNow.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' });
  const currentTime = taipeiNow.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: `你是提醒解析器。今天是 ${todayStr}，現在 ${currentTime}（台北 UTC+8）。

解析使用者輸入的提醒，回傳 JSON：
{
  "remind_at": "YYYY-MM-DDTHH:MM:SS+08:00（提醒觸發的時間）",
  "message": "提醒內容（簡潔描述要做的事）",
  "mention_others": ["要提醒的其他人名字（如果有 @某人）"],
  "mention_all": false,
  "confidence": 0.0~1.0
}

規則：
1. 「下周五前」= 下周五 09:00（「前」表示當天早上提醒）
2. 「明天」= 明天 09:00（沒指定時間預設早上9點）
3. 「今天6點」= 今天 18:00
4. 「下午3點」= 15:00
5. 「3點」沒說上下午，上班時間推測為下午
6. 「提醒我」「記得」= 提醒建立者自己
7. 「提醒 @王經理」= 提醒指定的人
8. 「提醒所有人」「提醒大家」= mention_all = true
9. message 只保留要做的事，不要包含時間和人名
10. 如果只說「下周五前 提供合約」，message = "提供合約"
11. 只回傳 JSON`,
        messages: [{ role: 'user', content: text }]
      })
    });

    if (!response.ok) {
      console.error('AI 解析提醒失敗:', response.status);
      return null;
    }

    const data = await response.json();
    const jsonMatch = data.content[0].text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.confidence >= 0.4 && parsed.remind_at && parsed.message) {
        console.log('🧠 AI 解析提醒結果:', parsed.message, parsed.remind_at);
        return parsed;
      }
    }
    return null;
  } catch (e) {
    console.error('AI 解析提醒失敗:', e.message);
    return null;
  }
}

/**
 * 取消提醒指令
 * @param {string} text - 使用者輸入
 * @param {string} groupId - LINE 群組 ID
 * @param {string} userId - LINE 使用者 ID
 * @param {string} replyToken - LINE reply token
 */
export async function handleCancelReminderCommand(text, groupId, userId, replyToken) {
  const keyword = text
    .replace(/^\/取消提醒\s*/, '')
    .replace(/取消.*提醒\s*/, '')
    .trim();

  if (!keyword) {
    // Show list of pending reminders for this group
    const { data: reminders } = await supabase
      .from('task_reminders')
      .select('id, message, remind_at')
      .eq('group_id', groupId)
      .eq('is_fired', false)
      .eq('is_cancelled', false)
      .order('remind_at', { ascending: true })
      .limit(10);

    if (!reminders || reminders.length === 0) {
      await reply(replyToken, '目前沒有待發送的提醒');
      return;
    }

    let listText = '📋 目前待發送的提醒：\n\n';
    reminders.forEach((r, i) => {
      const timeStr = new Date(r.remind_at).toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
      listText += `${i + 1}. ${r.message}（${timeStr}）\n`;
    });
    listText += `\n要取消請輸入：/取消提醒 [關鍵字]`;

    await reply(replyToken, listText);
    return;
  }

  // Find and cancel matching reminder
  const { data: reminders } = await supabase
    .from('task_reminders')
    .select('id, message, remind_at')
    .eq('group_id', groupId)
    .eq('is_fired', false)
    .eq('is_cancelled', false)
    .ilike('message', `%${keyword}%`)
    .limit(1);

  if (!reminders || reminders.length === 0) {
    await reply(replyToken, `❌ 找不到包含「${keyword}」的提醒`);
    return;
  }

  const target = reminders[0];
  await supabase
    .from('task_reminders')
    .update({ is_cancelled: true })
    .eq('id', target.id);

  await reply(replyToken, `✅ 已取消提醒：${target.message}`);
}

/**
 * 查看提醒列表
 * @param {string} groupId - LINE 群組 ID
 * @param {string} replyToken - LINE reply token
 */
export async function handleListRemindersCommand(groupId, replyToken) {
  const { data: reminders } = await supabase
    .from('task_reminders')
    .select('id, message, remind_at, mention_names')
    .eq('group_id', groupId)
    .eq('is_fired', false)
    .eq('is_cancelled', false)
    .order('remind_at', { ascending: true })
    .limit(15);

  if (!reminders || reminders.length === 0) {
    await reply(replyToken, '目前沒有待發送的提醒 ✨');
    return;
  }

  let listText = `⏰ 目前有 ${reminders.length} 個提醒：\n\n`;
  reminders.forEach((r, i) => {
    const timeStr = new Date(r.remind_at).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    });
    const who = r.mention_names?.join(', ') || '';
    listText += `${i + 1}. ${r.message}\n   📅 ${timeStr}${who ? ` 👤 ${who}` : ''}\n\n`;
  });

  await reply(replyToken, listText);
}

/**
 * 查看個人提醒（私訊用）
 * @param {string} userId - LINE 使用者 ID
 * @param {string} replyToken
 */
export async function handleListPersonalReminders(userId, replyToken) {
  const { data: reminders } = await supabase
    .from('task_reminders')
    .select('id, message, remind_at, group_id')
    .eq('created_by_line_id', userId)
    .eq('is_fired', false)
    .eq('is_cancelled', false)
    .order('remind_at', { ascending: true })
    .limit(15);

  if (!reminders || reminders.length === 0) {
    await reply(replyToken, '你目前沒有待發送的提醒 ✨');
    return;
  }

  let listText = `⏰ 你有 ${reminders.length} 個提醒：\n\n`;
  reminders.forEach((r, i) => {
    const timeStr = new Date(r.remind_at).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    });
    const source = r.group_id ? '(群組)' : '(個人)';
    listText += `${i + 1}. ${r.message}\n   📅 ${timeStr} ${source}\n\n`;
  });

  await reply(replyToken, listText);
}

/**
 * 取消個人提醒（私訊用）
 * @param {string} text - 使用者輸入
 * @param {string} userId - LINE 使用者 ID
 * @param {string} replyToken
 */
export async function handleCancelPersonalReminder(text, userId, replyToken) {
  const keyword = text
    .replace(/^\/取消提醒\s*/, '')
    .replace(/取消.*提醒\s*/, '')
    .trim();

  if (!keyword) {
    // 列出個人所有提醒
    await handleListPersonalReminders(userId, replyToken);
    return;
  }

  const { data: reminders } = await supabase
    .from('task_reminders')
    .select('id, message')
    .eq('created_by_line_id', userId)
    .eq('is_fired', false)
    .eq('is_cancelled', false)
    .ilike('message', `%${keyword}%`)
    .limit(1);

  if (!reminders || reminders.length === 0) {
    await reply(replyToken, `❌ 找不到包含「${keyword}」的提醒`);
    return;
  }

  await supabase
    .from('task_reminders')
    .update({ is_cancelled: true })
    .eq('id', reminders[0].id);

  await reply(replyToken, `✅ 已取消提醒：${reminders[0].message}`);
}

/**
 * LINE 回覆訊息
 */
async function reply(replyToken, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !replyToken) return;
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text: text.substring(0, 5000) }]
      })
    });
  } catch (e) {
    console.error('提醒回覆失敗:', e.message);
  }
}
