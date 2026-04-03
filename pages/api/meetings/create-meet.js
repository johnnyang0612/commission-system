// Google Meet 會議建立 API
// 串接 Google Calendar API 建立真正的日曆事件 + Meet 連結

import { supabase } from '../../../utils/supabaseClient';
import { createCalendarEvent, getAdminGoogleAccessToken } from '../../../utils/googleCalendar';
import { resolveParticipants } from '../../../utils/memberLookup';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      title,
      start_time,   // ISO string
      end_time,     // ISO string (optional, default +1 hour)
      participants, // array of { name, email?, line_user_id? }
      group_id,     // LINE group ID (optional)
      created_by,   // user ID (optional)
      created_by_line_id, // LINE user ID of creator (optional)
      notify_group  // whether to send LINE group notification (default true)
    } = req.body;

    // Auth check: verify caller identity
    const callerId = created_by || created_by_line_id;
    if (!callerId) {
      return res.status(401).json({ error: '缺少使用者身份 (created_by 或 created_by_line_id)' });
    }
    // Verify user exists (by user ID or LINE user ID)
    let callerValid = false;
    if (created_by) {
      const { data } = await supabase.from('users').select('id').eq('id', created_by).single();
      callerValid = !!data;
    }
    if (!callerValid && created_by_line_id) {
      const { data } = await supabase.from('users').select('id').eq('line_user_id', created_by_line_id).single();
      callerValid = !!data;
    }
    if (!callerValid) {
      return res.status(401).json({ error: '無效的使用者身份' });
    }

    if (!start_time) {
      return res.status(400).json({ error: '缺少會議開始時間 (start_time)' });
    }

    const startDate = new Date(start_time);
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({ error: '無效的開始時間格式' });
    }

    // Default end time = start + 1 hour
    const endDate = end_time ? new Date(end_time) : new Date(startDate.getTime() + 60 * 60 * 1000);

    // Generate meeting title
    const meetingTitle = title || `會議 - ${startDate.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}`;

    // 用模糊查找解析所有參與者（名字、email、LINE ID）
    const resolved = await resolveParticipants(participants, group_id);
    const attendeeEmails = [...resolved.emails];

    // 如果有找不到的人，記錄但不中斷
    if (resolved.unresolved.length > 0) {
      console.log(`⚠️ 找不到以下參與者: ${resolved.unresolved.join(', ')}`);
    }

    // 透過 Google Calendar API 建立真正的日曆事件 + Meet 連結
    let meetUrl = 'https://meet.google.com/new';  // fallback
    let googleEventId = null;
    let calendarLink = null;

    // 自動取得管理員 Google token（從 DB refresh_token 換新的 access_token）
    const googleToken = req.body.google_access_token || req.headers['x-google-token'] || await getAdminGoogleAccessToken();
    if (googleToken) {
      const calResult = await createCalendarEvent({
        accessToken: googleToken,
        title: meetingTitle,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        description: `由川輝系統建立${group_id ? ` (群組: ${group_id})` : ''}`,
        attendeeEmails
      });

      if (calResult.success) {
        meetUrl = calResult.meetUrl || meetUrl;
        googleEventId = calResult.eventId;
        calendarLink = calResult.htmlLink;
        console.log('✅ Google Calendar 事件已建立:', googleEventId, meetUrl);
        console.log(`📧 已邀請 ${calResult.attendees?.length || 0} 人`);
      } else {
        console.warn('⚠️ Google Calendar 建立失敗，使用 fallback:', calResult.error);
        // 繼續使用 fallback URL，不中斷流程
      }
    } else {
      console.log('ℹ️ 未提供 Google token，使用 Meet 快速連結');
    }

    // Look up creator info if line_user_id provided
    let creatorUserId = created_by;
    let creatorName = '未知';
    if (!creatorUserId && created_by_line_id) {
      const { data: creator } = await supabase
        .from('users')
        .select('id, name')
        .eq('line_user_id', created_by_line_id)
        .single();

      if (creator) {
        creatorUserId = creator.id;
        creatorName = creator.name;
      }
    } else if (creatorUserId) {
      const { data: creator } = await supabase
        .from('users')
        .select('name')
        .eq('id', creatorUserId)
        .single();
      if (creator) creatorName = creator.name;
    }

    // Look up group info for prospect/project linkage
    let prospectId = null;
    let projectId = null;
    let groupName = null;
    if (group_id) {
      const { data: group } = await supabase
        .from('line_groups')
        .select('prospect_id, project_id, group_name')
        .eq('group_id', group_id)
        .single();

      if (group) {
        prospectId = group.prospect_id;
        projectId = group.project_id;
        groupName = group.group_name;
      }
    }

    // Save meeting record to meeting_records table
    const meetingData = {
      title: meetingTitle,
      meeting_date: startDate.toISOString(),
      meeting_url: meetUrl,
      participants: Array.isArray(participants)
        ? participants.map(p => p.name || p).join(', ')
        : (participants || '所有人'),
      user_id: creatorUserId || null,
      prospect_id: prospectId,
      project_id: projectId,
      source: 'line_command',
      status: 'scheduled',
      summary: `由 ${creatorName} 透過 LINE 指令建立的會議`,
      google_event_id: googleEventId,
      calendar_link: calendarLink
    };

    const { data: meetingRecord, error: meetingError } = await supabase
      .from('meeting_records')
      .insert([meetingData])
      .select()
      .single();

    if (meetingError) {
      console.error('建立會議紀錄失敗:', meetingError);
      return res.status(500).json({ error: '建立會議紀錄失敗', details: meetingError.message });
    }

    // Create meeting reminder — 直接用 resolved 的結果
    const remindLineUserIds = new Set(resolved.lineUserIds);
    const remindUserIds = new Set();

    // 補充：如果 resolved 沒有足夠人，從舊邏輯補
    if (remindLineUserIds.size === 0 && group_id) {
      try {
        const { getGroupStaffLineIds } = await import('../../api/messaging/trackMember.js');
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

    // Add creator
    if (creatorUserId) remindUserIds.add(creatorUserId);
    if (created_by_line_id) remindLineUserIds.add(created_by_line_id);

    // Add specific participants with line_user_id
    if (Array.isArray(participants)) {
      for (const p of participants) {
        if (p.line_user_id) remindLineUserIds.add(p.line_user_id);
      }
    }

    const { data: reminder, error: reminderError } = await supabase
      .from('meeting_reminders')
      .insert({
        group_id: group_id || null,
        meeting_time: startDate.toISOString(),
        meeting_title: meetingTitle,
        meeting_link: meetUrl,
        remind_user_ids: Array.from(remindUserIds),
        remind_line_user_ids: Array.from(remindLineUserIds),
        confidence: 1.0,
        prospect_id: prospectId,
        project_id: projectId,
        detected_from_text: `LINE 指令建立`
      })
      .select()
      .single();

    if (reminderError) {
      console.error('建立會議提醒失敗:', reminderError);
      // Don't fail the whole request, meeting was already created
    }

    // Format response message
    const formattedDate = formatMeetingTime(startDate, endDate);
    const participantCount = Array.isArray(participants) ? participants.length : null;
    const participantText = Array.isArray(participants)
      ? participants.map(p => p.name || p).join(', ')
      : (participants || '所有人');

    // Send LINE group notification
    if (group_id && notify_group !== false) {
      const notifyMessage = buildMeetingNotification({
        title: meetingTitle,
        formattedDate,
        participantText,
        participantCount,
        meetUrl,
        creatorName,
        groupName
      });

      try {
        await sendLineGroupMessage(group_id, notifyMessage);
        console.log('已發送會議建立通知到群組:', group_id);
      } catch (e) {
        console.error('發送群組通知失敗:', e);
      }
    }

    return res.status(201).json({
      success: true,
      meeting: meetingRecord,
      reminder_id: reminder?.id,
      meet_url: meetUrl,
      google_event_id: googleEventId,
      calendar_link: calendarLink,
      attendee_emails: attendeeEmails,
      resolved_names: resolved.names,
      unresolved_names: resolved.unresolved,
      formatted_date: formattedDate,
      notification_sent: group_id && notify_group !== false
    });

  } catch (error) {
    console.error('建立會議錯誤:', error);
    return res.status(500).json({ error: '建立會議失敗', details: error.message });
  }
}

// Format meeting time for display (Asia/Taipei)
function formatMeetingTime(start, end) {
  const options = { timeZone: 'Asia/Taipei' };

  const year = start.toLocaleString('zh-TW', { ...options, year: 'numeric' }).replace('年', '');
  const month = start.toLocaleString('zh-TW', { ...options, month: '2-digit' });
  const day = start.toLocaleString('zh-TW', { ...options, day: '2-digit' });
  const weekday = start.toLocaleString('zh-TW', { ...options, weekday: 'short' });
  const startTime = start.toLocaleString('zh-TW', { ...options, hour: '2-digit', minute: '2-digit', hour12: false });
  const endTime = end.toLocaleString('zh-TW', { ...options, hour: '2-digit', minute: '2-digit', hour12: false });

  return `${year}/${month}/${day} (${weekday}) ${startTime}~${endTime}`;
}

// Build LINE notification message
function buildMeetingNotification({ title, formattedDate, participantText, participantCount, meetUrl, creatorName, groupName }) {
  let message = `📅 會議已建立！\n\n`;
  message += `標題：${title}\n`;
  message += `時間：${formattedDate}\n`;

  if (participantCount) {
    message += `參與者：${participantText}（${participantCount}人）\n`;
  } else {
    message += `參與者：${participantText}\n`;
  }

  message += `\n🔗 加入會議：${meetUrl}\n`;
  message += `\n建立者：${creatorName}`;
  if (meetUrl !== 'https://meet.google.com/new') {
    message += `\n\n✅ 已建立 Google Calendar + 發送日曆邀請`;
  }

  return message;
}

// Send message to LINE group
async function sendLineGroupMessage(groupId, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.error('缺少 LINE_CHANNEL_ACCESS_TOKEN，無法發送群組訊息');
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
