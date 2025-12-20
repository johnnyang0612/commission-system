// AI 會議偵測 - 從訊息中偵測會議時間
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../../../utils/supabaseClient';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message_text, group_id, message_id } = req.body;

  if (!message_text || !group_id) {
    return res.status(400).json({ error: '缺少必要參數' });
  }

  try {
    const result = await detectMeetingFromText(message_text, group_id, message_id);
    return res.status(200).json(result);
  } catch (error) {
    console.error('會議偵測錯誤:', error);
    return res.status(500).json({ error: error.message });
  }
}

export async function detectMeetingFromText(text, groupId, messageId) {
  // 快速檢查是否可能包含會議資訊
  const meetingKeywords = ['會議', '開會', 'meet', 'zoom', '線上會議', '討論', '碰面', '約', '點', '時', 'AM', 'PM', '上午', '下午'];
  const hasKeyword = meetingKeywords.some(k => text.toLowerCase().includes(k.toLowerCase()));

  if (!hasKeyword || text.length < 10) {
    return { detected: false };
  }

  // 使用 AI 偵測
  const today = new Date().toISOString().split('T')[0];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `分析以下訊息，判斷是否包含會議/約定時間資訊。

今天日期: ${today}

訊息內容:
"""
${text}
"""

如果有會議資訊，回傳 JSON 格式:
{
  "has_meeting": true,
  "meeting_time": "YYYY-MM-DD HH:mm" (24小時制),
  "meeting_title": "會議主題 (如果有)",
  "meeting_link": "會議連結 (如果有)",
  "confidence": 0.0-1.0
}

如果沒有明確的會議時間，回傳:
{ "has_meeting": false }

只回傳 JSON，不要其他文字。`
    }]
  });

  try {
    const content = response.content[0].text.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { detected: false };
    }

    const result = JSON.parse(jsonMatch[0]);

    if (result.has_meeting && result.meeting_time && result.confidence >= 0.6) {
      // 取得群組關聯的 prospect/project 和負責人
      const { data: group } = await supabase
        .from('line_groups')
        .select('prospect_id, project_id, project_owner_id')
        .eq('group_id', groupId)
        .single();

      // 取得要提醒的人 (老闆們 + Project Owner)
      const { data: admins } = await supabase
        .from('users')
        .select('id, line_user_id')
        .in('role', ['admin', 'leader'])
        .not('line_user_id', 'is', null);

      const remindUserIds = admins?.map(u => u.id) || [];
      const remindLineUserIds = admins?.map(u => u.line_user_id).filter(Boolean) || [];

      // 加入 Project Owner
      if (group?.project_owner_id) {
        const { data: owner } = await supabase
          .from('users')
          .select('id, line_user_id')
          .eq('id', group.project_owner_id)
          .single();

        if (owner && !remindUserIds.includes(owner.id)) {
          remindUserIds.push(owner.id);
          if (owner.line_user_id) {
            remindLineUserIds.push(owner.line_user_id);
          }
        }
      }

      // 儲存到資料庫
      const { data: reminder, error } = await supabase
        .from('meeting_reminders')
        .insert({
          group_id: groupId,
          message_id: messageId,
          meeting_time: result.meeting_time,
          meeting_title: result.meeting_title || null,
          meeting_link: result.meeting_link || null,
          remind_user_ids: remindUserIds,
          remind_line_user_ids: remindLineUserIds,
          detected_from_text: text.substring(0, 500),
          confidence: result.confidence,
          prospect_id: group?.prospect_id || null,
          project_id: group?.project_id || null
        })
        .select()
        .single();

      if (error) {
        console.error('儲存會議提醒失敗:', error);
      } else {
        console.log('偵測到會議:', result.meeting_time, '已建立提醒');
      }

      return {
        detected: true,
        meeting: result,
        reminder_id: reminder?.id
      };
    }

    return { detected: false };
  } catch (e) {
    console.error('解析 AI 回應失敗:', e);
    return { detected: false };
  }
}
