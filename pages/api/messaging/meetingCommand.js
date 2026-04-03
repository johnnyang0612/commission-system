// LINE 群組會議指令處理
// 解析 /建立會議、/會議、/meeting 等指令，建立會議並通知群組

import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';
import { createCalendarEvent, getAdminGoogleAccessToken } from '../../../utils/googleCalendar';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// API handler (for direct API calls)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, group_id, user_id, reply_token } = req.body;

  if (!text || !group_id) {
    return res.status(400).json({ error: '缺少必要參數 (text, group_id)' });
  }

  try {
    const result = await handleMeetingCommand(text, group_id, user_id, reply_token);
    return res.status(200).json(result);
  } catch (error) {
    console.error('會議指令 API 錯誤:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Handle meeting creation command from LINE group
 * Supports:
 *   /建立會議 4/13 15:00~16:00 所有人
 *   /會議 明天 14:30
 *   /meeting 下周三 15:00 王經理 李專員
 *   @川輝AI助理 幫我建立會議 4/13 15:00
 */
export async function handleMeetingCommand(text, groupId, userId, replyToken) {
  console.log('處理會議指令:', text, '群組:', groupId);

  // Clean up the command prefix
  const cleanText = text
    .replace(/^\/建立會議\s*/, '')
    .replace(/^\/會議\s*/, '')
    .replace(/^\/meeting\s*/i, '')
    .replace(/@\S+\s*/, '') // Remove @mentions
    .replace(/幫我建立(?:下周|下週)?會議\s*/i, '')
    .replace(/建立會議\s*/i, '')
    .trim();

  // Parse the command
  const parsed = parseMeetingCommand(cleanText);

  if (!parsed.startTime) {
    // Could not parse date/time, send help message
    const helpMessage = `❓ 無法解析會議時間\n\n📖 使用方式：\n/建立會議 4/13 15:00~16:00 所有人\n/建立會議 明天 14:30 王經理\n/建立會議 下周三 15:00\n\n支援格式：\n• 日期：4/13、2026-04-13、明天、後天、下周一~日\n• 時間：15:00、15:00~16:00\n• 參與者：所有人、@姓名（可選）`;

    if (replyToken) {
      await replyMessage(replyToken, helpMessage);
    }

    return { success: false, error: '無法解析會議時間', help_sent: true };
  }

  // Build participants list
  const participants = parsed.participants.length > 0
    ? parsed.participants.map(name => ({ name }))
    : [{ name: '所有人' }];

  // Build title
  const titleDate = parsed.startTime.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric'
  });
  const title = parsed.title || `會議 - ${titleDate}`;

  // Call create-meet API internally
  try {
    const meetResult = await createMeetInternal({
      title,
      start_time: parsed.startTime.toISOString(),
      end_time: parsed.endTime ? parsed.endTime.toISOString() : null,
      participants,
      group_id: groupId,
      created_by_line_id: userId,
      notify_group: false // We'll send our own reply
    });

    // Format the reply
    const formattedDate = formatMeetingTimeDisplay(parsed.startTime, parsed.endTime);
    const participantText = parsed.participants.length > 0
      ? parsed.participants.join(', ')
      : '所有人';

    // Get creator name
    let creatorName = '未知';
    if (userId) {
      const { data: creator } = await supabase
        .from('users')
        .select('name')
        .eq('line_user_id', userId)
        .single();
      if (creator) creatorName = creator.name;
    }

    // Get participant count from group if "all"
    let participantCountStr = '';
    if (parsed.participants.length === 0 || parsed.participants.includes('所有人')) {
      try {
        const { getGroupStaffLineIds } = await import('./trackMember.js');
        const staff = await getGroupStaffLineIds(groupId);
        if (staff.length > 0) {
          participantCountStr = `（${staff.length}人）`;
        }
      } catch (e) {
        // ignore
      }
    } else {
      participantCountStr = `（${parsed.participants.length}人）`;
    }

    const actualMeetUrl = meetResult.meet_url || 'https://meet.google.com/new';

    let replyText = `📅 會議已建立！\n\n`;
    replyText += `標題：${title}\n`;
    replyText += `時間：${formattedDate}\n`;
    replyText += `參與者：${participantText}${participantCountStr}\n`;
    replyText += `\n🔗 加入會議：${actualMeetUrl}\n`;
    if (meetResult.google_event_id) {
      replyText += `\n已自動發送日曆邀請給所有有 Email 的成員`;
    }
    replyText += `\n建立者：${creatorName}`;

    if (replyToken) {
      await replyMessage(replyToken, replyText);
    } else {
      // Fallback: use push message to group
      await sendLineGroupMessage(groupId, replyText);
    }

    return {
      success: true,
      meeting: meetResult.meeting,
      reminder_id: meetResult.reminder_id,
      parsed
    };
  } catch (error) {
    console.error('建立會議失敗:', error);

    const errorMessage = `❌ 建立會議失敗\n\n原因：${error.message}\n\n請稍後再試或聯繫管理員。`;

    if (replyToken) {
      await replyMessage(replyToken, errorMessage);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Parse meeting command text into structured data
 * Returns: { startTime, endTime, participants, title }
 */
function parseMeetingCommand(text) {
  const result = {
    startTime: null,
    endTime: null,
    participants: [],
    title: null
  };

  if (!text) return result;

  // Get current time in Asia/Taipei
  const now = getNowInTaipei();
  const todayTaipei = new Date(now);
  todayTaipei.setHours(0, 0, 0, 0);

  // --- Parse Date ---
  let dateFound = false;
  let targetDate = new Date(todayTaipei);

  // Pattern: YYYY-MM-DD
  const isoDateMatch = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoDateMatch) {
    targetDate.setFullYear(parseInt(isoDateMatch[1]));
    targetDate.setMonth(parseInt(isoDateMatch[2]) - 1);
    targetDate.setDate(parseInt(isoDateMatch[3]));
    dateFound = true;
  }

  // Pattern: M/D or MM/DD
  if (!dateFound) {
    const slashDateMatch = text.match(/(\d{1,2})\/(\d{1,2})/);
    if (slashDateMatch) {
      const month = parseInt(slashDateMatch[1]);
      const day = parseInt(slashDateMatch[2]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        targetDate.setMonth(month - 1);
        targetDate.setDate(day);
        // If the date is in the past, assume next year
        if (targetDate < todayTaipei) {
          targetDate.setFullYear(targetDate.getFullYear() + 1);
        }
        dateFound = true;
      }
    }
  }

  // Pattern: 明天
  if (!dateFound && /明天/.test(text)) {
    targetDate.setDate(targetDate.getDate() + 1);
    dateFound = true;
  }

  // Pattern: 後天
  if (!dateFound && /後天/.test(text)) {
    targetDate.setDate(targetDate.getDate() + 2);
    dateFound = true;
  }

  // Pattern: 大後天
  if (!dateFound && /大後天/.test(text)) {
    targetDate.setDate(targetDate.getDate() + 3);
    dateFound = true;
  }

  // Pattern: 今天
  if (!dateFound && /今天/.test(text)) {
    // targetDate is already today
    dateFound = true;
  }

  // Pattern: 下周X / 下週X / 下禮拜X
  if (!dateFound) {
    const nextWeekMatch = text.match(/下(?:周|週|禮拜)([一二三四五六日天])/);
    if (nextWeekMatch) {
      const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
      const targetDayOfWeek = dayMap[nextWeekMatch[1]];
      if (targetDayOfWeek !== undefined) {
        const currentDayOfWeek = now.getDay();
        // Days until next week's target day
        let daysUntil = (7 - currentDayOfWeek + targetDayOfWeek) % 7;
        if (daysUntil === 0) daysUntil = 7; // If same day of week, go to next week
        // Always go to next week (add 7 if within this week)
        if (daysUntil <= (7 - currentDayOfWeek)) {
          daysUntil += 7;
        }
        targetDate.setDate(targetDate.getDate() + daysUntil);
        dateFound = true;
      }
    }
  }

  // Pattern: 這周X / 這週X / 這禮拜X / 周X / 週X
  if (!dateFound) {
    const thisWeekMatch = text.match(/(?:這|本)?(?:周|週|禮拜)([一二三四五六日天])/);
    if (thisWeekMatch) {
      const dayMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
      const targetDayOfWeek = dayMap[thisWeekMatch[1]];
      if (targetDayOfWeek !== undefined) {
        const currentDayOfWeek = now.getDay();
        let daysUntil = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
        if (daysUntil === 0) daysUntil = 7; // If today, assume next occurrence
        targetDate.setDate(targetDate.getDate() + daysUntil);
        dateFound = true;
      }
    }
  }

  // If no date found, default to today
  if (!dateFound) {
    // Only set date to today, we still need time
  }

  // --- Parse Time ---
  let startHour = null;
  let startMinute = null;
  let endHour = null;
  let endMinute = null;

  // Pattern: HH:MM~HH:MM or HH:MM-HH:MM
  const timeRangeMatch = text.match(/(\d{1,2}):(\d{2})\s*[~\-]\s*(\d{1,2}):(\d{2})/);
  if (timeRangeMatch) {
    startHour = parseInt(timeRangeMatch[1]);
    startMinute = parseInt(timeRangeMatch[2]);
    endHour = parseInt(timeRangeMatch[3]);
    endMinute = parseInt(timeRangeMatch[4]);
  } else {
    // Pattern: HH:MM (single time)
    const singleTimeMatch = text.match(/(\d{1,2}):(\d{2})/);
    if (singleTimeMatch) {
      startHour = parseInt(singleTimeMatch[1]);
      startMinute = parseInt(singleTimeMatch[2]);
    } else {
      // Pattern: X點 or X點Y分
      const zhTimeMatch = text.match(/(\d{1,2})點(?:(\d{1,2})分)?/);
      if (zhTimeMatch) {
        startHour = parseInt(zhTimeMatch[1]);
        startMinute = zhTimeMatch[2] ? parseInt(zhTimeMatch[2]) : 0;
      }
    }
  }

  // Handle AM/PM, 上午/下午
  if (startHour !== null && startHour < 12) {
    if (/(?:下午|PM)/i.test(text)) {
      startHour += 12;
    }
  }

  if (!dateFound && startHour === null) {
    // No date and no time could be parsed
    return result;
  }

  // If we have time but no explicit date, and the time already passed today, use tomorrow
  if (!dateFound && startHour !== null) {
    const nowHour = now.getHours();
    const nowMinute = now.getMinutes();
    if (startHour < nowHour || (startHour === nowHour && (startMinute || 0) <= nowMinute)) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
  }

  // Build start time
  if (startHour !== null) {
    targetDate.setHours(startHour, startMinute || 0, 0, 0);
    result.startTime = taipeiToUTC(targetDate);

    // Build end time
    if (endHour !== null) {
      const endDate = new Date(targetDate);
      endDate.setHours(endHour, endMinute || 0, 0, 0);
      // If end time is before start time, assume next day
      if (endDate <= targetDate) {
        endDate.setDate(endDate.getDate() + 1);
      }
      result.endTime = taipeiToUTC(endDate);
    } else {
      // Default: 1 hour meeting
      result.endTime = new Date(result.startTime.getTime() + 60 * 60 * 1000);
    }
  } else if (dateFound) {
    // Date found but no time - default to 10:00 AM Taipei
    targetDate.setHours(10, 0, 0, 0);
    result.startTime = taipeiToUTC(targetDate);
    result.endTime = new Date(result.startTime.getTime() + 60 * 60 * 1000);
  }

  // --- Parse Participants ---
  // Remove date/time parts from text to isolate participant names
  let remainingText = text
    .replace(/\d{4}-\d{1,2}-\d{1,2}/, '')
    .replace(/\d{1,2}\/\d{1,2}/, '')
    .replace(/\d{1,2}:\d{2}\s*[~\-]\s*\d{1,2}:\d{2}/, '')
    .replace(/\d{1,2}:\d{2}/, '')
    .replace(/\d{1,2}點(?:\d{1,2}分)?/, '')
    .replace(/(?:明天|後天|大後天|今天)/, '')
    .replace(/(?:下|這|本)?(?:周|週|禮拜)[一二三四五六日天]/, '')
    .replace(/(?:上午|下午|AM|PM)/gi, '')
    .trim();

  // Parse participants: space/comma separated names, or "所有人"
  if (remainingText) {
    const parts = remainingText.split(/[,，\s]+/).filter(p => p.length > 0);
    for (const part of parts) {
      if (part === '所有人' || part === '全部' || part === 'all' || part === '大家') {
        result.participants = ['所有人'];
        break;
      }
      // Skip common noise words
      if (['的', '和', '跟', '與', '及'].includes(part)) continue;
      result.participants.push(part.replace(/^@/, '')); // Remove @ prefix
    }
  }

  return result;
}

/**
 * Get current time in Asia/Taipei timezone
 */
function getNowInTaipei() {
  const now = new Date();
  // Convert to Taipei time by using the offset
  // Taipei is UTC+8
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  return new Date(utcMs + (8 * 60 * 60 * 1000));
}

/**
 * Convert a Date object representing Taipei local time to UTC
 */
function taipeiToUTC(taipeiDate) {
  // taipeiDate is constructed as if it were in Taipei timezone (UTC+8)
  // We need to subtract 8 hours to get UTC
  const utcMs = taipeiDate.getTime() - (8 * 60 * 60 * 1000);
  // But we also need to account for the server's timezone offset
  const serverOffset = new Date().getTimezoneOffset() * 60 * 1000;
  return new Date(utcMs + serverOffset);
}

/**
 * Format meeting time for LINE display
 */
function formatMeetingTimeDisplay(start, end) {
  const options = { timeZone: 'Asia/Taipei' };

  const dateStr = start.toLocaleDateString('zh-TW', {
    ...options,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });

  const startTimeStr = start.toLocaleTimeString('zh-TW', {
    ...options,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  if (end) {
    const endTimeStr = end.toLocaleTimeString('zh-TW', {
      ...options,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return `${dateStr} ${startTimeStr}~${endTimeStr}`;
  }

  return `${dateStr} ${startTimeStr}`;
}

/**
 * Internal function to create meeting without going through HTTP
 */
async function createMeetInternal({ title, start_time, end_time, participants, group_id, created_by_line_id, notify_group }) {
  const startDate = new Date(start_time);
  const endDate = end_time ? new Date(end_time) : new Date(startDate.getTime() + 60 * 60 * 1000);

  // Lookup creator
  let creatorUserId = null;
  let creatorName = '未知';
  if (created_by_line_id) {
    const { data: creator } = await supabase
      .from('users')
      .select('id, name')
      .eq('line_user_id', created_by_line_id)
      .single();

    if (creator) {
      creatorUserId = creator.id;
      creatorName = creator.name;
    }
  }

  // Get group linkage
  let prospectId = null;
  let projectId = null;
  if (group_id) {
    const { data: group } = await supabase
      .from('line_groups')
      .select('prospect_id, project_id')
      .eq('group_id', group_id)
      .single();

    if (group) {
      prospectId = group.prospect_id;
      projectId = group.project_id;
    }
  }

  // 使用管理員 Google 帳號建立真正的 Calendar 事件
  let meetUrl = null;
  let googleEventId = null;
  let calendarLink = null;

  const googleToken = await getAdminGoogleAccessToken();
  if (googleToken) {
    // 收集受邀者 email
    const attendeeEmails = [];
    if (group_id) {
      const { data: groupMembers } = await supabase
        .from('group_participants')
        .select('identity:identity_id(email)')
        .eq('line_group_id', group_id);
      groupMembers?.forEach(m => {
        if (m.identity?.email) attendeeEmails.push(m.identity.email);
      });
    }

    const calResult = await createCalendarEvent({
      accessToken: googleToken,
      title,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      description: `由 ${creatorName} 透過 LINE 建立`,
      attendeeEmails
    });

    if (calResult.success) {
      meetUrl = calResult.meetUrl;
      googleEventId = calResult.eventId;
      calendarLink = calResult.htmlLink;
      console.log('✅ Google Calendar 事件已建立:', googleEventId);
    } else {
      console.warn('⚠️ Google Calendar 建立失敗:', calResult.error);
    }
  }

  if (!meetUrl) meetUrl = 'https://meet.google.com/new';

  // Create meeting record
  const { data: meetingRecord, error: meetingError } = await supabase
    .from('meeting_records')
    .insert([{
      title,
      meeting_date: startDate.toISOString(),
      meeting_url: meetUrl,
      participants: Array.isArray(participants) ? participants.map(p => p.name || p).join(', ') : '所有人',
      user_id: creatorUserId,
      prospect_id: prospectId,
      project_id: projectId,
      source: 'line_command',
      status: 'scheduled',
      summary: `由 ${creatorName} 透過 LINE 指令建立的會議`,
      google_event_id: googleEventId,
      calendar_link: calendarLink
    }])
    .select()
    .single();

  if (meetingError) {
    throw new Error('建立會議紀錄失敗: ' + meetingError.message);
  }

  // Create reminder
  const remindLineUserIds = new Set();
  const remindUserIds = new Set();

  if (group_id) {
    try {
      const { getGroupStaffLineIds } = await import('./trackMember.js');
      const groupStaff = await getGroupStaffLineIds(group_id);
      groupStaff.forEach(m => {
        if (m.lineUserId) remindLineUserIds.add(m.lineUserId);
        if (m.userId) remindUserIds.add(m.userId);
      });
    } catch (e) {
      console.log('取得群組成員跳過:', e.message);
    }
  }

  // Add admins
  const { data: admins } = await supabase
    .from('users')
    .select('id, line_user_id')
    .eq('role', 'admin')
    .not('line_user_id', 'is', null);

  admins?.forEach(a => {
    if (a.id) remindUserIds.add(a.id);
    if (a.line_user_id) remindLineUserIds.add(a.line_user_id);
  });

  if (creatorUserId) remindUserIds.add(creatorUserId);
  if (created_by_line_id) remindLineUserIds.add(created_by_line_id);

  const { data: reminder, error: reminderError } = await supabase
    .from('meeting_reminders')
    .insert({
      group_id: group_id || null,
      meeting_time: startDate.toISOString(),
      meeting_title: title,
      meeting_link: meetUrl,
      remind_user_ids: Array.from(remindUserIds),
      remind_line_user_ids: Array.from(remindLineUserIds),
      confidence: 1.0,
      prospect_id: prospectId,
      project_id: projectId,
      detected_from_text: 'LINE 指令建立'
    })
    .select()
    .single();

  if (reminderError) {
    console.error('建立會議提醒失敗:', reminderError);
  }

  return {
    meeting: meetingRecord,
    reminder_id: reminder?.id,
    meet_url: meetUrl,
    google_event_id: googleEventId
  };
}

/**
 * Handle meeting modification command from LINE
 * Formats:
 *   /修改會議 [會議標題關鍵字] 改時間 4/15 15:00
 *   /修改會議 [會議標題關鍵字] 改標題 新標題
 */
export async function handleModifyMeetingCommand(text, groupId, userId, replyToken) {
  console.log('處理修改會議指令:', text);

  const cleanText = text
    .replace(/^\/修改會議\s*/, '')
    .replace(/^\/改會議\s*/, '')
    .trim();

  if (!cleanText) {
    const helpMsg = `❓ 修改會議用法：\n\n/修改會議 [關鍵字] 改時間 4/15 15:00\n/修改會議 [關鍵字] 改標題 新標題\n\n例如：\n/修改會議 週三會議 改時間 4/16 14:00`;
    if (replyToken) await replyMessage(replyToken, helpMsg);
    return { success: false, error: 'empty command' };
  }

  // Parse: keyword + action
  const timeChangeMatch = cleanText.match(/(.+?)\s*改時間\s+(.+)/);
  const titleChangeMatch = cleanText.match(/(.+?)\s*改標題\s+(.+)/);

  let keyword, updates = {};

  if (timeChangeMatch) {
    keyword = timeChangeMatch[1].trim();
    const timePart = timeChangeMatch[2].trim();
    const parsed = parseMeetingCommand(timePart);
    if (parsed.startTime) {
      updates.start_time = parsed.startTime.toISOString();
      if (parsed.endTime) updates.end_time = parsed.endTime.toISOString();
    } else {
      if (replyToken) await replyMessage(replyToken, '❌ 無法解析新的時間');
      return { success: false, error: 'cannot parse time' };
    }
  } else if (titleChangeMatch) {
    keyword = titleChangeMatch[1].trim();
    updates.title = titleChangeMatch[2].trim();
  } else {
    if (replyToken) await replyMessage(replyToken, '❓ 請指定要改什麼\n\n/修改會議 [關鍵字] 改時間 新時間\n/修改會議 [關鍵字] 改標題 新標題');
    return { success: false, error: 'no action specified' };
  }

  // Find the meeting by keyword (search in title, recent meetings in this group)
  let meetingQuery = supabase
    .from('meeting_records')
    .select('*')
    .neq('status', 'cancelled')
    .order('meeting_date', { ascending: false })
    .limit(10);

  if (groupId) {
    const { data: group } = await supabase
      .from('line_groups')
      .select('prospect_id, project_id')
      .eq('group_id', groupId)
      .single();

    if (group?.prospect_id) meetingQuery = meetingQuery.eq('prospect_id', group.prospect_id);
    else if (group?.project_id) meetingQuery = meetingQuery.eq('project_id', group.project_id);
  }

  const { data: meetings } = await meetingQuery;
  const targetMeeting = meetings?.find(m => m.title?.includes(keyword));

  if (!targetMeeting) {
    if (replyToken) await replyMessage(replyToken, `❌ 找不到包含「${keyword}」的會議`);
    return { success: false, error: 'meeting not found' };
  }

  try {
    // Update in DB directly
    const dbUpdates = {};
    if (updates.title) dbUpdates.title = updates.title;
    if (updates.start_time) dbUpdates.meeting_date = updates.start_time;
    if (updates.end_time) dbUpdates.end_time = updates.end_time;
    dbUpdates.updated_at = new Date().toISOString();

    await supabase.from('meeting_records').update(dbUpdates).eq('id', targetMeeting.id);

    // Update Google Calendar
    if (targetMeeting.google_event_id) {
      const googleToken = await getAdminGoogleAccessToken();
      if (googleToken) {
        const { updateCalendarEvent } = await import('../../../utils/googleCalendar.js');
        const calUpdates = {};
        if (updates.title) calUpdates.summary = updates.title;
        if (updates.start_time) calUpdates.start = { dateTime: updates.start_time, timeZone: 'Asia/Taipei' };
        if (updates.end_time) calUpdates.end = { dateTime: updates.end_time, timeZone: 'Asia/Taipei' };
        await updateCalendarEvent({ accessToken: googleToken, eventId: targetMeeting.google_event_id, updates: calUpdates });
        console.log('✅ Google Calendar 已同步更新');
      }
    }

    // Update reminders if time changed
    if (updates.start_time) {
      await supabase
        .from('meeting_reminders')
        .update({
          meeting_time: updates.start_time,
          meeting_title: updates.title || targetMeeting.title,
          reminder_status: 'pending'
        })
        .eq('meeting_title', targetMeeting.title);
    }

    // Reply
    let replyText = `📝 會議已修改\n\n`;
    replyText += `標題：${updates.title || targetMeeting.title}\n`;
    if (updates.start_time) {
      replyText += `新時間：${new Date(updates.start_time).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
    }
    if (targetMeeting.google_event_id) {
      replyText += `\n已同步更新 Google Calendar，受邀者會收到更新通知`;
    }

    if (replyToken) await replyMessage(replyToken, replyText);
    return { success: true };
  } catch (error) {
    console.error('修改會議失敗:', error);
    if (replyToken) await replyMessage(replyToken, `❌ 修改會議失敗: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Handle meeting cancellation command from LINE
 * Formats:
 *   /取消會議 [會議標題關鍵字]
 *   /取消會議 [會議標題關鍵字] 原因：客戶行程衝突
 */
export async function handleCancelMeetingCommand(text, groupId, userId, replyToken) {
  console.log('處理取消會議指令:', text);

  const cleanText = text
    .replace(/^\/取消會議\s*/, '')
    .replace(/^\/cancel\s*/i, '')
    .trim();

  if (!cleanText) {
    if (replyToken) await replyMessage(replyToken, '❓ 請指定要取消的會議\n\n/取消會議 [關鍵字]\n/取消會議 [關鍵字] 原因：xxx');
    return { success: false };
  }

  // Parse keyword and optional reason
  const reasonMatch = cleanText.match(/(.+?)\s*原因[：:]\s*(.+)/);
  const keyword = reasonMatch ? reasonMatch[1].trim() : cleanText;
  const reason = reasonMatch ? reasonMatch[2].trim() : null;

  // Find meeting
  let meetingQuery = supabase
    .from('meeting_records')
    .select('*')
    .neq('status', 'cancelled')
    .order('meeting_date', { ascending: false })
    .limit(10);

  if (groupId) {
    const { data: group } = await supabase
      .from('line_groups')
      .select('prospect_id, project_id')
      .eq('group_id', groupId)
      .single();
    if (group?.prospect_id) meetingQuery = meetingQuery.eq('prospect_id', group.prospect_id);
    else if (group?.project_id) meetingQuery = meetingQuery.eq('project_id', group.project_id);
  }

  const { data: meetings } = await meetingQuery;
  const targetMeeting = meetings?.find(m => m.title?.includes(keyword));

  if (!targetMeeting) {
    if (replyToken) await replyMessage(replyToken, `❌ 找不到包含「${keyword}」的會議`);
    return { success: false };
  }

  try {
    // Cancel in DB
    await supabase
      .from('meeting_records')
      .update({
        status: 'cancelled',
        summary: (targetMeeting.summary || '') + `\n[已取消] ${reason || ''}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetMeeting.id);

    // Delete Google Calendar event
    if (targetMeeting.google_event_id) {
      const googleToken = await getAdminGoogleAccessToken();
      if (googleToken) {
        const { deleteCalendarEvent } = await import('../../../utils/googleCalendar.js');
        await deleteCalendarEvent({ accessToken: googleToken, eventId: targetMeeting.google_event_id });
        console.log('✅ Google Calendar 事件已刪除');
      }
    }

    // Delete reminders
    await supabase.from('meeting_reminders').delete().eq('meeting_title', targetMeeting.title);

    // Reply
    let replyText = `❌ 會議已取消\n\n`;
    replyText += `標題：${targetMeeting.title}\n`;
    replyText += `原時間：${new Date(targetMeeting.meeting_date).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
    if (reason) replyText += `原因：${reason}\n`;
    if (targetMeeting.google_event_id) {
      replyText += `\n已同步取消 Google Calendar，受邀者會收到取消通知`;
    }

    if (replyToken) await replyMessage(replyToken, replyText);
    return { success: true };
  } catch (error) {
    console.error('取消會議失敗:', error);
    if (replyToken) await replyMessage(replyToken, `❌ 取消會議失敗: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Send reply to LINE
async function replyMessage(replyToken, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.warn('缺少 LINE_CHANNEL_ACCESS_TOKEN，無法回覆');
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
        messages: [{ type: 'text', text }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('LINE 回覆失敗:', err);
    }
  } catch (error) {
    console.error('發送 LINE 回覆錯誤:', error);
  }
}

// Send push message to LINE group
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
    throw new Error(`LINE Push 失敗: ${err.message || response.status}`);
  }
}
