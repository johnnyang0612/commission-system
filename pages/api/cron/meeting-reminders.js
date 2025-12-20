// 定時任務：檢查並發送會議提醒
// 建議用 Vercel Cron 或外部服務每小時呼叫一次

import { supabase } from '../../../utils/supabaseClient';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export default async function handler(req, res) {
  // 驗證 cron secret (可選，防止濫用)
  const cronSecret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const results = {
      checked: 0,
      reminded_1day: 0,
      reminded_1hour: 0,
      errors: []
    };

    // 取得需要提醒的會議
    // 1天內 且 尚未提醒過1天
    // 1小時內 且 尚未提醒過1小時
    const oneDayLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    const { data: reminders, error } = await supabase
      .from('meeting_reminders')
      .select(`
        *,
        line_groups:group_id(group_name, prospect_id, project_id)
      `)
      .gt('meeting_time', now.toISOString())
      .lt('meeting_time', oneDayLater.toISOString());

    if (error) throw error;

    results.checked = reminders?.length || 0;

    for (const reminder of reminders || []) {
      const meetingTime = new Date(reminder.meeting_time);
      const timeDiff = meetingTime.getTime() - now.getTime();
      const hoursUntil = timeDiff / (1000 * 60 * 60);

      try {
        // 1小時內提醒
        if (hoursUntil <= 1 && !reminder.reminded_1hour) {
          await sendReminder(reminder, '1hour');
          await supabase
            .from('meeting_reminders')
            .update({ reminded_1hour: true, reminded_at_1hour: now.toISOString() })
            .eq('id', reminder.id);
          results.reminded_1hour++;
        }
        // 1天內提醒 (但超過1小時)
        else if (hoursUntil <= 24 && hoursUntil > 1 && !reminder.reminded_1day) {
          await sendReminder(reminder, '1day');
          await supabase
            .from('meeting_reminders')
            .update({ reminded_1day: true, reminded_at_1day: now.toISOString() })
            .eq('id', reminder.id);
          results.reminded_1day++;
        }
      } catch (e) {
        console.error('發送提醒失敗:', e);
        results.errors.push({ reminder_id: reminder.id, error: e.message });
      }
    }

    return res.status(200).json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('Cron 錯誤:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function sendReminder(reminder, type) {
  const lineUserIds = reminder.remind_line_user_ids || [];

  if (lineUserIds.length === 0) {
    console.log('沒有可提醒的 LINE 用戶');
    return;
  }

  // 取得群組摘要和待辦事項
  let summary = null;
  try {
    const { data: summaries } = await supabase
      .from('line_conversation_summaries')
      .select('summary, action_items, key_topics')
      .eq('group_id', reminder.group_id)
      .order('created_at', { ascending: false })
      .limit(1);

    summary = summaries?.[0];
  } catch (e) {
    console.error('取得摘要失敗:', e);
  }

  // 格式化會議時間
  const meetingDate = new Date(reminder.meeting_time);
  const timeStr = meetingDate.toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short'
  });

  // 建立提醒訊息
  const urgency = type === '1hour' ? '⚠️ 1小時後' : '📅 明天';
  const groupName = reminder.line_groups?.group_name || '群組';

  let message = `${urgency} 有會議！\n\n`;
  message += `📍 群組: ${groupName}\n`;
  message += `🕐 時間: ${timeStr}\n`;

  if (reminder.meeting_title) {
    message += `📋 主題: ${reminder.meeting_title}\n`;
  }

  if (reminder.meeting_link) {
    message += `🔗 連結: ${reminder.meeting_link}\n`;
  }

  // 加入待辦事項
  if (summary?.action_items?.length > 0) {
    message += `\n✅ 待辦事項:\n`;
    summary.action_items.slice(0, 5).forEach((item, i) => {
      message += `${i + 1}. ${item}\n`;
    });
  }

  // 加入簡短摘要
  if (summary?.summary) {
    const shortSummary = summary.summary.length > 150
      ? summary.summary.substring(0, 150) + '...'
      : summary.summary;
    message += `\n📝 近期討論:\n${shortSummary}`;
  }

  // 發送 LINE Push Message
  for (const lineUserId of lineUserIds) {
    await pushLineMessage(lineUserId, message);
  }

  console.log(`已發送 ${type} 提醒給 ${lineUserIds.length} 人`);
}

async function pushLineMessage(userId, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.error('缺少 LINE_CHANNEL_ACCESS_TOKEN');
    return;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to: userId,
      messages: [{
        type: 'text',
        text: text
      }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`LINE Push 失敗: ${err.message || response.status}`);
  }
}
