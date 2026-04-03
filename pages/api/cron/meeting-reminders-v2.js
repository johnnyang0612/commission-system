// 定時任務 v2：強化會議提醒
// T-1 day (前一天) 和 T-1 hour (前一小時) 兩階段提醒
// 建議 Vercel Cron 每 15 分鐘執行一次

import { supabase } from '../../../utils/supabaseClient';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export default async function handler(req, res) {
  // 驗證 cron secret（可選）
  const authHeader = req.headers.authorization;
  const cronSecret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    // Also accept Vercel Cron's authorization header
    if (!authHeader?.includes('Bearer')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const now = new Date();
    const results = {
      checked: 0,
      day_before_sent: 0,
      hour_before_sent: 0,
      already_passed: 0,
      errors: []
    };

    console.log(`[meeting-reminders-v2] 開始執行，當前時間: ${now.toISOString()}`);

    // ============================
    // Phase 1: T-1 day reminders
    // Find meetings between 23-25 hours from now that haven't received day-before reminder
    // ============================
    const dayBeforeStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const dayBeforeEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const { data: dayBeforeReminders, error: dayError } = await supabase
      .from('meeting_reminders')
      .select(`
        *,
        line_groups:group_id(group_name, prospect_id, project_id)
      `)
      .gte('meeting_time', dayBeforeStart.toISOString())
      .lte('meeting_time', dayBeforeEnd.toISOString())
      .eq('reminded_1day', false)
      .eq('is_cancelled', false);

    if (dayError) {
      console.error('查詢 T-1 day 提醒失敗:', dayError);
      results.errors.push({ phase: 'day_before_query', error: dayError.message });
    } else {
      console.log(`[T-1 day] 找到 ${dayBeforeReminders?.length || 0} 個待提醒會議`);

      for (const reminder of dayBeforeReminders || []) {
        try {
          await sendDayBeforeReminder(reminder);

          await supabase
            .from('meeting_reminders')
            .update({
              reminded_1day: true,
              reminded_at_1day: now.toISOString()
            })
            .eq('id', reminder.id);

          results.day_before_sent++;
          console.log(`[T-1 day] 已發送提醒: ${reminder.meeting_title || reminder.id}`);
        } catch (e) {
          console.error(`[T-1 day] 發送失敗:`, e);
          results.errors.push({ reminder_id: reminder.id, phase: 'day_before', error: e.message });
        }
      }
    }

    // ============================
    // Phase 2: T-1 hour reminders
    // Find meetings between 50-70 minutes from now that haven't received hour-before reminder
    // ============================
    const hourBeforeStart = new Date(now.getTime() + 50 * 60 * 1000);
    const hourBeforeEnd = new Date(now.getTime() + 70 * 60 * 1000);

    const { data: hourBeforeReminders, error: hourError } = await supabase
      .from('meeting_reminders')
      .select(`
        *,
        line_groups:group_id(group_name, prospect_id, project_id)
      `)
      .gte('meeting_time', hourBeforeStart.toISOString())
      .lte('meeting_time', hourBeforeEnd.toISOString())
      .eq('reminded_1hour', false)
      .eq('is_cancelled', false);

    if (hourError) {
      console.error('查詢 T-1 hour 提醒失敗:', hourError);
      results.errors.push({ phase: 'hour_before_query', error: hourError.message });
    } else {
      console.log(`[T-1 hour] 找到 ${hourBeforeReminders?.length || 0} 個待提醒會議`);

      for (const reminder of hourBeforeReminders || []) {
        try {
          await sendHourBeforeReminder(reminder);

          await supabase
            .from('meeting_reminders')
            .update({
              reminded_1hour: true,
              reminded_at_1hour: now.toISOString()
            })
            .eq('id', reminder.id);

          results.hour_before_sent++;
          console.log(`[T-1 hour] 已發送提醒: ${reminder.meeting_title || reminder.id}`);
        } catch (e) {
          console.error(`[T-1 hour] 發送失敗:`, e);
          results.errors.push({ reminder_id: reminder.id, phase: 'hour_before', error: e.message });
        }
      }
    }

    // ============================
    // Phase 3: Mark passed meetings
    // Update meetings that have already passed without being reminded
    // ============================
    const { data: passedMeetings, error: passedError } = await supabase
      .from('meeting_reminders')
      .select('id')
      .lt('meeting_time', now.toISOString())
      .eq('is_cancelled', false)
      .or('reminded_1day.eq.false,reminded_1hour.eq.false');

    if (!passedError && passedMeetings?.length > 0) {
      const passedIds = passedMeetings.map(m => m.id);
      await supabase
        .from('meeting_reminders')
        .update({
          reminded_1day: true,
          reminded_1hour: true
        })
        .in('id', passedIds);

      results.already_passed = passedMeetings.length;
      console.log(`[清理] 標記 ${passedMeetings.length} 個已過期會議`);
    }

    results.checked = (dayBeforeReminders?.length || 0) + (hourBeforeReminders?.length || 0);

    console.log(`[meeting-reminders-v2] 完成:`, results);

    return res.status(200).json({
      success: true,
      timestamp: now.toISOString(),
      ...results
    });

  } catch (error) {
    console.error('[meeting-reminders-v2] 執行錯誤:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * 取得參與者的顯示名稱列表（用來在群組訊息中 @ 標記）
 */
async function getParticipantNames(reminder) {
  const names = [];
  const lineUserIds = reminder.remind_line_user_ids || [];

  for (const lineUserId of lineUserIds) {
    // 先查 contact_identities
    const { data: identity } = await supabase
      .from('contact_identities')
      .select('display_name, real_name')
      .eq('line_user_id', lineUserId)
      .single();

    if (identity) {
      names.push(identity.real_name || identity.display_name);
      continue;
    }

    // 再查 users
    const { data: user } = await supabase
      .from('users')
      .select('name')
      .eq('line_user_id', lineUserId)
      .single();

    if (user) {
      names.push(user.name);
    }
  }

  return names;
}

/**
 * Send T-1 day reminder（只在群組發，@ 標記參與者）
 */
async function sendDayBeforeReminder(reminder) {
  if (!reminder.group_id) return;

  const meetingDate = new Date(reminder.meeting_time);
  const timeStr = formatMeetingTime(meetingDate);

  // 取得參與者名稱
  const participantNames = await getParticipantNames(reminder);
  const mentionText = participantNames.length > 0
    ? participantNames.map(n => `@${n}`).join(' ')
    : '';

  let message = `📅 明天有會議提醒！\n\n`;
  message += `🕐 時間：${timeStr}\n`;

  if (reminder.meeting_title) {
    message += `📋 主題：${reminder.meeting_title}\n`;
  }

  if (reminder.meeting_link && reminder.meeting_link !== 'https://meet.google.com/new') {
    message += `🔗 連結：${reminder.meeting_link}\n`;
  }

  // 附上待辦事項和摘要
  const summary = await getLatestGroupSummary(reminder.group_id);
  if (summary?.action_items?.length > 0) {
    message += `\n✅ 待辦事項：\n`;
    summary.action_items.slice(0, 5).forEach((item, i) => {
      message += `${i + 1}. ${item}\n`;
    });
  }
  if (summary?.summary) {
    const shortSummary = summary.summary.length > 150
      ? summary.summary.substring(0, 150) + '...'
      : summary.summary;
    message += `\n📝 近期討論：\n${shortSummary}`;
  }

  // @ 標記參與者
  if (mentionText) {
    message += `\n\n👥 ${mentionText} 請留意`;
  }

  try {
    await sendLineGroupMessage(reminder.group_id, message);
    console.log(`[T-1 day] 已發送到群組: ${reminder.group_id}（@ ${participantNames.length} 人）`);
  } catch (e) {
    console.error(`[T-1 day] 群組推送失敗: ${e.message}`);
  }
}

/**
 * Send T-1 hour reminder（只在群組發，@ 標記參與者）
 */
async function sendHourBeforeReminder(reminder) {
  if (!reminder.group_id) return;

  const meetingDate = new Date(reminder.meeting_time);
  const timeStr = formatMeetingTime(meetingDate);

  // 取得參與者名稱
  const participantNames = await getParticipantNames(reminder);
  const mentionText = participantNames.length > 0
    ? participantNames.map(n => `@${n}`).join(' ')
    : '';

  let message = `⚠️ 會議即將開始！（1小時後）\n\n`;
  message += `🕐 時間：${timeStr}\n`;

  if (reminder.meeting_title) {
    message += `📋 主題：${reminder.meeting_title}\n`;
  }

  if (reminder.meeting_link && reminder.meeting_link !== 'https://meet.google.com/new') {
    message += `\n🔗 立即加入：${reminder.meeting_link}`;
  }

  // @ 標記參與者
  if (mentionText) {
    message += `\n\n👥 ${mentionText} 準備開會`;
  }

  try {
    await sendLineGroupMessage(reminder.group_id, message);
    console.log(`[T-1 hour] 已發送到群組: ${reminder.group_id}（@ ${participantNames.length} 人）`);
  } catch (e) {
    console.error(`[T-1 hour] 群組推送失敗: ${e.message}`);
  }
}

/**
 * Format meeting time to readable string (Taipei timezone)
 */
function formatMeetingTime(date) {
  return date.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Get latest conversation summary for a group
 */
async function getLatestGroupSummary(groupId) {
  try {
    const { data: summaries } = await supabase
      .from('line_conversation_summaries')
      .select('summary, action_items, key_topics')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1);

    return summaries?.[0] || null;
  } catch (e) {
    console.error('取得群組摘要失敗:', e);
    return null;
  }
}

/**
 * Send push message to LINE group
 */
async function sendLineGroupMessage(groupId, text) {
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
      to: groupId,
      messages: [{ type: 'text', text }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`LINE Group Push 失敗: ${err.message || response.status}`);
  }
}

