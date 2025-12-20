// LINE Login Callback - 處理員工綁定
import { supabase } from '../../../utils/supabaseClient';

const LINE_LOGIN_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID;
const LINE_LOGIN_CHANNEL_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET;

export default async function handler(req, res) {
  const { code, state, error: lineError } = req.query;

  // LINE Login 錯誤
  if (lineError) {
    return res.redirect('/profile?bind=error&message=' + encodeURIComponent(lineError));
  }

  if (!code || !state) {
    return res.redirect('/profile?bind=error&message=missing_params');
  }

  try {
    // 解析 state 取得 user_id
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { user_id } = stateData;

    if (!user_id) {
      throw new Error('Invalid state: missing user_id');
    }

    // 用 code 換取 access token
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || req.headers.origin}/api/messaging/bindCallback`,
        client_id: LINE_LOGIN_CHANNEL_ID,
        client_secret: LINE_LOGIN_CHANNEL_SECRET
      })
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.json();
      throw new Error(err.error_description || 'Token exchange failed');
    }

    const tokenData = await tokenResponse.json();

    // 用 access token 取得用戶資料
    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    if (!profileResponse.ok) {
      throw new Error('Failed to get LINE profile');
    }

    const profile = await profileResponse.json();

    // 儲存到資料庫
    const { error: dbError } = await supabase
      .from('users')
      .update({
        line_user_id: profile.userId,
        line_display_name: profile.displayName,
        line_picture_url: profile.pictureUrl,
        line_linked_at: new Date().toISOString()
      })
      .eq('id', user_id);

    if (dbError) {
      throw dbError;
    }

    // 更新現有的群組成員記錄
    await supabase
      .from('line_group_members')
      .update({
        member_type: 'staff',
        user_id: user_id
      })
      .eq('line_user_id', profile.userId);

    // 更新現有的訊息記錄
    await supabase
      .from('line_messages')
      .update({
        sender_type: 'staff'
      })
      .eq('sender_id', profile.userId);

    // 成功，重定向回個人資料頁
    return res.redirect('/profile?bind=success&name=' + encodeURIComponent(profile.displayName));

  } catch (error) {
    console.error('LINE 綁定失敗:', error);
    return res.redirect('/profile?bind=error&message=' + encodeURIComponent(error.message));
  }
}
