// LINE 帳號綁定 API
// 員工透過 LINE Login 綁定帳號

import { supabase } from '../../../utils/supabaseClient';
import crypto from 'crypto';

const LINE_LOGIN_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID;
const LINE_LOGIN_CHANNEL_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // 產生綁定連結
    return generateBindingLink(req, res);
  } else if (req.method === 'POST') {
    // 處理綁定 callback
    return handleBindingCallback(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// 產生 LINE Login 綁定連結
function generateBindingLink(req, res) {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: '缺少 user_id' });
  }

  if (!LINE_LOGIN_CHANNEL_ID) {
    return res.status(500).json({ error: '缺少 LINE_LOGIN_CHANNEL_ID' });
  }

  // 產生 state (包含 user_id，用於 callback 時識別)
  const state = Buffer.from(JSON.stringify({
    user_id,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex')
  })).toString('base64');

  // LINE Login URL
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || req.headers.origin}/api/messaging/bindCallback`;

  const lineLoginUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
  lineLoginUrl.searchParams.set('response_type', 'code');
  lineLoginUrl.searchParams.set('client_id', LINE_LOGIN_CHANNEL_ID);
  lineLoginUrl.searchParams.set('redirect_uri', redirectUri);
  lineLoginUrl.searchParams.set('state', state);
  lineLoginUrl.searchParams.set('scope', 'profile openid');
  lineLoginUrl.searchParams.set('bot_prompt', 'aggressive'); // 提示加入官方帳號

  return res.status(200).json({
    url: lineLoginUrl.toString(),
    state
  });
}

// 處理綁定 (從 LINE OA 訊息觸發)
async function handleBindingCallback(req, res) {
  const { line_user_id, user_id, display_name, picture_url } = req.body;

  if (!line_user_id || !user_id) {
    return res.status(400).json({ error: '缺少必要參數' });
  }

  try {
    // 更新 users 表
    const { data, error } = await supabase
      .from('users')
      .update({
        line_user_id,
        line_display_name: display_name,
        line_picture_url: picture_url,
        line_linked_at: new Date().toISOString()
      })
      .eq('id', user_id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // 更新現有的 line_group_members 記錄
    await supabase
      .from('line_group_members')
      .update({
        member_type: 'staff',
        user_id: user_id
      })
      .eq('line_user_id', line_user_id);

    // 更新現有的 line_messages 記錄
    await supabase
      .from('line_messages')
      .update({
        sender_type: 'staff'
      })
      .eq('sender_id', line_user_id);

    return res.status(200).json({
      success: true,
      message: 'LINE 帳號綁定成功',
      user: {
        id: data.id,
        name: data.name,
        line_display_name: display_name
      }
    });

  } catch (error) {
    console.error('綁定失敗:', error);
    return res.status(500).json({ error: '綁定失敗', details: error.message });
  }
}
