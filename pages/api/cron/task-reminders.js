// 定時任務：任務提醒
// 每 15 分鐘執行，發送到期的任務提醒到 LINE 群組

import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export default async function handler(req, res) {
  // 驗證 cron secret（可選）
  const authHeader = req.headers.authorization;
  const cronSecret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    if (!authHeader?.includes('Bearer')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const now = new Date();
    const results = { fired: 0, errors: [] };

    console.log(`[task-reminders] 開始執行，當前時間: ${now.toISOString()}`);

    // Find reminders that should fire: remind_at <= now AND not fired AND not cancelled
    const { data: dueReminders, error } = await supabase
      .from('task_reminders')
      .select('*')
      .lte('remind_at', now.toISOString())
      .eq('is_fired', false)
      .eq('is_cancelled', false)
      .order('remind_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[task-reminders] 查詢失敗:', error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log(`[task-reminders] 找到 ${dueReminders?.length || 0} 個到期提醒`);

    for (const reminder of dueReminders || []) {
      try {
        // Build reminder message with @ mentions
        const mentionText = (reminder.mention_names || []).map(n => `@${n}`).join(' ');

        let message = `⏰ 提醒！\n\n`;
        message += `📋 ${reminder.message}\n`;
        if (mentionText) {
          message += `\n👤 ${mentionText}`;
        }

        if (reminder.group_id) {
          // 群組提醒 → 推到群組
          await sendLinePush(reminder.group_id, message);
          console.log(`[task-reminders] 群組提醒已發送: ${reminder.message}`);
        } else if (reminder.created_by_line_id) {
          // 個人提醒（私訊建立的）→ 私訊回給建立者
          await sendLinePush(reminder.created_by_line_id, message);
          console.log(`[task-reminders] 個人提醒已發送: ${reminder.message} → ${reminder.created_by_line_id}`);
        } else {
          console.log(`[task-reminders] 跳過無對象的提醒: ${reminder.id}`);
          continue;
        }

        // Mark as fired
        await supabase
          .from('task_reminders')
          .update({ is_fired: true, fired_at: now.toISOString() })
          .eq('id', reminder.id);

        results.fired++;
      } catch (e) {
        console.error(`[task-reminders] 發送提醒失敗 ${reminder.id}:`, e.message);
        results.errors.push({ id: reminder.id, error: e.message });
      }
    }

    console.log(`[task-reminders] 完成，已發送 ${results.fired} 個提醒`);
    return res.status(200).json({ success: true, ...results });
  } catch (error) {
    console.error('[task-reminders] 執行錯誤:', error.message);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * 發送 LINE 群組推播訊息
 */
/**
 * 發送 LINE 推播（群組或個人都用同一個 API）
 * @param {string} to - 群組 ID 或個人 LINE User ID
 * @param {string} text - 訊息內容
 */
async function sendLinePush(to, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.warn('[task-reminders] 缺少 LINE_CHANNEL_ACCESS_TOKEN');
    return;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text: text.substring(0, 5000) }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`LINE push 失敗: ${response.status} ${err.message || ''}`);
  }
}
