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
  "client_name": "客戶/公司名稱 (如果訊息中有提到)",
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
      // 取得群組關聯的 prospect/project
      const { data: group } = await supabase
        .from('line_groups')
        .select('prospect_id, project_id, owner_user_id, group_type, group_name')
        .eq('group_id', groupId)
        .single();

      // 如果群組本身沒有關聯 prospect，嘗試用 AI 偵測的客戶名稱匹配
      let matchedProspectId = group?.prospect_id;
      let matchedProjectId = group?.project_id;

      if (!matchedProspectId && result.client_name) {
        const { data: matchedProspect } = await supabase
          .from('prospects')
          .select('id')
          .ilike('client_name', `%${result.client_name}%`)
          .limit(1)
          .single();

        if (matchedProspect) {
          matchedProspectId = matchedProspect.id;
          console.log(`從訊息中匹配到客戶: ${result.client_name}`);
        }
      }

      if (!matchedProjectId && result.client_name) {
        const { data: matchedProject } = await supabase
          .from('projects')
          .select('id')
          .ilike('client_name', `%${result.client_name}%`)
          .limit(1)
          .single();

        if (matchedProject) {
          matchedProjectId = matchedProject.id;
        }
      }

      // 智能去重：檢查是否已有相似的會議提醒
      const meetingTime = new Date(result.meeting_time);
      const timeWindow = 30 * 60 * 1000; // 30分鐘內視為同一會議
      const timeStart = new Date(meetingTime.getTime() - timeWindow).toISOString();
      const timeEnd = new Date(meetingTime.getTime() + timeWindow).toISOString();

      const { data: existingMeetings } = await supabase
        .from('meeting_reminders')
        .select('id, group_id, meeting_time, meeting_title, prospect_id, project_id')
        .gte('meeting_time', timeStart)
        .lte('meeting_time', timeEnd)
        .eq('is_cancelled', false);

      // 判斷是否為重複會議
      let isDuplicate = false;
      let relatedMeetingId = null;

      if (existingMeetings && existingMeetings.length > 0) {
        for (const existing of existingMeetings) {
          // 同群組同時間 = 完全重複
          if (existing.group_id === groupId) {
            console.log('同群組已有相同時間會議，跳過');
            isDuplicate = true;
            break;
          }

          // 不同群組但相關聯（同 prospect 或 project）
          const sameProspect = matchedProspectId && existing.prospect_id === matchedProspectId;
          const sameProject = matchedProjectId && existing.project_id === matchedProjectId;

          if (sameProspect || sameProject) {
            console.log('相關群組已有相同時間會議，合併通知對象');
            relatedMeetingId = existing.id;
            // 不算完全重複，但要合併通知對象
            break;
          }
        }
      }

      if (isDuplicate) {
        return { detected: true, duplicate: true, meeting: result };
      }

      // 取得群組內所有員工（PO + PM + 老闆）
      const { getGroupStaffLineIds } = await import('./trackMember.js');
      const groupStaff = await getGroupStaffLineIds(groupId);

      // 另外取得 admin (可能不在群組內但也要通知)
      const { data: admins } = await supabase
        .from('users')
        .select('id, line_user_id')
        .eq('role', 'admin')
        .not('line_user_id', 'is', null);

      // 合併：群組內員工 + admin
      const remindUserIds = new Set();
      const remindLineUserIds = new Set();

      // 加入群組成員
      groupStaff.forEach(m => {
        if (m.userId) remindUserIds.add(m.userId);
        if (m.lineUserId) remindLineUserIds.add(m.lineUserId);
      });

      // 加入 admin
      admins?.forEach(a => {
        if (a.id) remindUserIds.add(a.id);
        if (a.line_user_id) remindLineUserIds.add(a.line_user_id);
      });

      // 確保 owner 也在（備用）
      if (group?.owner_user_id) {
        const { data: owner } = await supabase
          .from('users')
          .select('id, line_user_id')
          .eq('id', group.owner_user_id)
          .single();

        if (owner) {
          remindUserIds.add(owner.id);
          if (owner.line_user_id) remindLineUserIds.add(owner.line_user_id);
        }
      }

      // 如果有相關會議，合併通知對象而非新建
      if (relatedMeetingId) {
        const { data: existingReminder } = await supabase
          .from('meeting_reminders')
          .select('remind_user_ids, remind_line_user_ids, related_group_ids')
          .eq('id', relatedMeetingId)
          .single();

        if (existingReminder) {
          // 合併通知對象
          const mergedUserIds = new Set([
            ...(existingReminder.remind_user_ids || []),
            ...Array.from(remindUserIds)
          ]);
          const mergedLineUserIds = new Set([
            ...(existingReminder.remind_line_user_ids || []),
            ...Array.from(remindLineUserIds)
          ]);
          const relatedGroups = new Set([
            ...(existingReminder.related_group_ids || []),
            groupId
          ]);

          await supabase
            .from('meeting_reminders')
            .update({
              remind_user_ids: Array.from(mergedUserIds),
              remind_line_user_ids: Array.from(mergedLineUserIds),
              related_group_ids: Array.from(relatedGroups)
            })
            .eq('id', relatedMeetingId);

          console.log(`已合併會議通知對象，來源群組: ${group?.group_name || groupId}`);

          return {
            detected: true,
            merged: true,
            existing_reminder_id: relatedMeetingId,
            meeting: result
          };
        }
      }

      // 新建會議提醒
      const { data: reminder, error } = await supabase
        .from('meeting_reminders')
        .insert({
          group_id: groupId,
          message_id: messageId,
          meeting_time: result.meeting_time,
          meeting_title: result.meeting_title || null,
          meeting_link: result.meeting_link || null,
          remind_user_ids: Array.from(remindUserIds),
          remind_line_user_ids: Array.from(remindLineUserIds),
          detected_from_text: text.substring(0, 500),
          confidence: result.confidence,
          prospect_id: matchedProspectId || null,
          project_id: matchedProjectId || null,
          source_group_type: group?.group_type || null,
          detected_client_name: result.client_name || null
        })
        .select()
        .single();

      console.log(`會議提醒對象: ${Array.from(remindLineUserIds).length} 人`);

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
