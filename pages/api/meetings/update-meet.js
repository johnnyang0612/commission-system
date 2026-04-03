import { supabase } from '../../../utils/supabaseClient';
import { updateCalendarEvent, getAdminGoogleAccessToken } from '../../../utils/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { meeting_id, title, start_time, end_time, participants, notify_group, userId } = req.body;

    // Auth check: verify caller identity
    if (!userId) {
      return res.status(401).json({ error: '缺少使用者身份 (userId)' });
    }
    const { data: caller } = await supabase.from('users').select('id').eq('id', userId).single();
    if (!caller) {
      return res.status(401).json({ error: '無效的使用者' });
    }

    if (!meeting_id) {
      return res.status(400).json({ error: '缺少 meeting_id' });
    }

    // 1. Get existing meeting
    const { data: meeting, error: fetchError } = await supabase
      .from('meeting_records')
      .select('*')
      .eq('id', meeting_id)
      .single();

    if (fetchError || !meeting) {
      return res.status(404).json({ error: '找不到會議' });
    }

    // 2. Build update data
    const updates = {};
    if (title) updates.title = title;
    if (start_time) updates.meeting_date = new Date(start_time).toISOString();
    if (end_time) updates.end_time = new Date(end_time).toISOString();
    if (participants) updates.participants = Array.isArray(participants) ? participants.map(p => p.name || p).join(', ') : participants;
    updates.updated_at = new Date().toISOString();

    // 3. Update Google Calendar if google_event_id exists
    if (meeting.google_event_id) {
      const googleToken = await getAdminGoogleAccessToken();
      if (googleToken) {
        const calUpdates = {};
        if (title) calUpdates.summary = title;
        if (start_time) calUpdates.start = { dateTime: new Date(start_time).toISOString(), timeZone: 'Asia/Taipei' };
        if (end_time) calUpdates.end = { dateTime: new Date(end_time).toISOString(), timeZone: 'Asia/Taipei' };

        const calResult = await updateCalendarEvent({
          accessToken: googleToken,
          eventId: meeting.google_event_id,
          updates: calUpdates
        });

        if (calResult.success) {
          console.log('✅ Google Calendar 事件已更新');
        } else {
          console.warn('⚠️ Google Calendar 更新失敗:', calResult.error);
        }
      }
    }

    // 4. Update meeting record in DB
    const { data: updatedMeeting, error: updateError } = await supabase
      .from('meeting_records')
      .update(updates)
      .eq('id', meeting_id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: '更新會議失敗', details: updateError.message });
    }

    // 5. Update reminder if time changed
    if (start_time) {
      await supabase
        .from('meeting_reminders')
        .update({
          meeting_time: new Date(start_time).toISOString(),
          meeting_title: title || meeting.title,
          reminder_status: 'pending'
        })
        .eq('meeting_title', meeting.title);
    }

    // 6. Notify LINE group
    if (notify_group !== false && meeting.source === 'line_command') {
      const groupId = meeting.group_id || null;
      if (groupId) {
        const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (LINE_CHANNEL_ACCESS_TOKEN) {
          let notifyText = `📝 會議已修改\n\n`;
          notifyText += `標題：${title || meeting.title}\n`;
          if (start_time) {
            const startDate = new Date(start_time);
            const endDate = end_time ? new Date(end_time) : null;
            notifyText += `新時間：${startDate.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
            if (endDate) notifyText += ` ~ ${endDate.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })}`;
            notifyText += `\n`;
          }
          if (meeting.meeting_url && meeting.meeting_url !== 'https://meet.google.com/new') {
            notifyText += `\n🔗 會議連結：${meeting.meeting_url}`;
          }

          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
            },
            body: JSON.stringify({
              to: groupId,
              messages: [{ type: 'text', text: notifyText }]
            })
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      meeting: updatedMeeting
    });

  } catch (error) {
    console.error('更新會議錯誤:', error);
    return res.status(500).json({ error: '更新會議失敗', details: error.message });
  }
}
