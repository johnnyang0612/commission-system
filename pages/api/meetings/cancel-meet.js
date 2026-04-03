import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';
import { deleteCalendarEvent, getAdminGoogleAccessToken } from '../../../utils/googleCalendar';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { meeting_id, reason, notify_group, userId } = req.body;

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

    // 2. Delete Google Calendar event if exists
    if (meeting.google_event_id) {
      const googleToken = await getAdminGoogleAccessToken();
      if (googleToken) {
        const calResult = await deleteCalendarEvent({
          accessToken: googleToken,
          eventId: meeting.google_event_id
        });

        if (calResult.success) {
          console.log('✅ Google Calendar 事件已取消');
        } else {
          console.warn('⚠️ Google Calendar 取消失敗:', calResult.error);
        }
      }
    }

    // 3. Update meeting status to cancelled
    const { error: updateError } = await supabase
      .from('meeting_records')
      .update({
        status: 'cancelled',
        summary: (meeting.summary || '') + `\n[已取消] ${reason || ''}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', meeting_id);

    if (updateError) {
      return res.status(500).json({ error: '取消會議失敗', details: updateError.message });
    }

    // 4. Delete reminders
    await supabase
      .from('meeting_reminders')
      .delete()
      .eq('meeting_title', meeting.title);

    // 5. Notify LINE group
    if (notify_group !== false) {
      const groupId = meeting.group_id || null;
      if (groupId) {
        const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (LINE_CHANNEL_ACCESS_TOKEN) {
          let notifyText = `❌ 會議已取消\n\n`;
          notifyText += `標題：${meeting.title}\n`;
          notifyText += `原時間：${new Date(meeting.meeting_date).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
          if (reason) notifyText += `原因：${reason}`;

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
      message: '會議已取消'
    });

  } catch (error) {
    console.error('取消會議錯誤:', error);
    return res.status(500).json({ error: '取消會議失敗', details: error.message });
  }
}
