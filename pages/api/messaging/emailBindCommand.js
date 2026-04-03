import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// API handler (for direct API calls)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, group_id, sender_id, sender_name, reply_token } = req.body;

  if (!text || !group_id) {
    return res.status(400).json({ error: '缺少必要參數 (text, group_id)' });
  }

  try {
    await handleEmailBindCommand(text, group_id, sender_id, sender_name, reply_token);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Email 綁定指令 API 錯誤:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Handle email binding command from LINE group
 * Supported formats:
 *   @川輝AI助理 @某人 綁定Email:xxx@gmail.com
 *   /綁定 xxx@gmail.com (binds the sender's own email)
 *   /綁定 @某人 xxx@gmail.com
 */
export async function handleEmailBindCommand(text, groupId, senderId, senderName, replyToken) {
  try {
    // 1. Parse the command - extract email
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (!emailMatch) {
      await reply(replyToken, '❌ 找不到有效的 Email 地址。\n\n用法：\n/綁定 your@email.com\n/綁定 @某人 their@email.com');
      return;
    }
    const email = emailMatch[0];

    // 2. Validate email format
    if (!/^[\w.-]+@[\w.-]+\.\w{2,}$/.test(email)) {
      await reply(replyToken, '❌ Email 格式不正確');
      return;
    }

    // 3. Determine target user
    // If text contains @mention before the email, bind to that person
    // Otherwise bind to the sender
    let targetLineUserId = senderId;
    let targetName = senderName;

    // Check for @mention pattern (LINE mentions come as special objects, but in text they appear as @name)
    const mentionMatch = text.match(/@(\S+)\s/);
    if (mentionMatch && mentionMatch[1] !== '川輝' && mentionMatch[1] !== '川輝AI助理') {
      // Try to find the mentioned person in contact_identities by display_name
      const { data: target } = await supabase
        .from('contact_identities')
        .select('id, line_user_id, display_name')
        .eq('display_name', mentionMatch[1])
        .single();

      if (target) {
        targetLineUserId = target.line_user_id;
        targetName = target.display_name;
      }
    }

    // 4. Check permission (only admin/leader/pm/finance can bind others)
    if (targetLineUserId !== senderId) {
      const { data: senderUser } = await supabase
        .from('users')
        .select('role')
        .eq('line_user_id', senderId)
        .single();

      if (!senderUser || !['admin', 'leader', 'pm', 'finance'].includes(senderUser.role)) {
        await reply(replyToken, '❌ 只有管理者可以幫他人綁定 Email');
        return;
      }
    }

    // 5. Update contact_identities
    const { data: identity, error: findError } = await supabase
      .from('contact_identities')
      .select('id, email, display_name')
      .eq('line_user_id', targetLineUserId)
      .single();

    if (identity) {
      // Update existing
      const { error } = await supabase
        .from('contact_identities')
        .update({ email, updated_at: new Date().toISOString() })
        .eq('id', identity.id);

      if (error) throw error;
      await reply(replyToken, `✅ 已更新 ${targetName} 的 Email：${email}`);
    } else {
      // Create new
      const { error } = await supabase
        .from('contact_identities')
        .insert([{
          line_user_id: targetLineUserId,
          display_name: targetName,
          email,
          identity_type: 'unknown'
        }]);

      if (error) throw error;
      await reply(replyToken, `✅ 已為 ${targetName} 建立聯絡人並綁定 Email：${email}`);
    }

    // 6. Log to assistant_commands
    try {
      const { logAssistantAction } = await import('../../../utils/assistantLogger.js');
      await logAssistantAction({
        actorIdentityId: identity?.id || null,
        channel: 'line_group',
        sourceGroupId: groupId,
        commandType: 'bind_email',
        rawInput: text,
        parsedIntent: { target: targetName, email },
        resultStatus: 'success',
        resultData: { email, target_identity_id: identity?.id }
      });
    } catch (logError) {
      console.error('助理指令記錄失敗:', logError.message);
    }

  } catch (error) {
    console.error('Email 綁定指令處理失敗:', error);
    await reply(replyToken, `❌ 綁定失敗：${error.message}`);

    try {
      const { logAssistantAction } = await import('../../../utils/assistantLogger.js');
      await logAssistantAction({
        channel: 'line_group',
        sourceGroupId: groupId,
        commandType: 'bind_email',
        rawInput: text,
        resultStatus: 'failed',
        errorMessage: error.message
      });
    } catch (logError) {
      console.error('助理指令記錄失敗:', logError.message);
    }
  }
}

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
        messages: [{ type: 'text', text }]
      })
    });
  } catch (error) {
    console.error('LINE 回覆失敗:', error);
  }
}
