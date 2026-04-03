// Unified Agent Process API
// Single endpoint for both web and LINE channels to submit requests.

import { processAgentRequest } from '../../../utils/agentCore';
import { supabase } from '../../../utils/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    message,
    channel,
    userId,
    lineUserId,
    groupId,
    history,
    replyToken,
    metadata,
  } = req.body;

  if (!message) {
    return res.status(400).json({ error: '缺少訊息內容 (message)' });
  }

  // Auth check: verify caller identity
  const callerId = userId || lineUserId;
  if (!callerId) {
    return res.status(401).json({ error: '缺少使用者身份 (userId 或 lineUserId)' });
  }

  if (supabase) {
    let callerValid = false;
    if (userId) {
      const { data } = await supabase.from('users').select('id').eq('id', userId).single();
      callerValid = !!data;
    }
    if (!callerValid && lineUserId) {
      const { data } = await supabase.from('users').select('id').eq('line_user_id', lineUserId).single();
      callerValid = !!data;
    }
    if (!callerValid) {
      return res.status(401).json({ error: '無效的使用者身份' });
    }
  }

  try {
    const result = await processAgentRequest({
      message,
      channel,
      userId,
      lineUserId,
      groupId,
      history,
      replyToken,
      metadata,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Agent process API 錯誤:', error);
    return res.status(500).json({ error: error.message });
  }
}
