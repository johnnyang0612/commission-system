// Google Calendar 授權 callback
// 用 code 換 refresh_token，存到 system_settings

import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect('/settings?google_auth=error&message=' + encodeURIComponent(error));
  }

  if (!code) {
    return res.redirect('/settings?google_auth=error&message=missing_code');
  }

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://commission-system-delta.vercel.app';
  const redirectUri = `${APP_URL}/api/google/callback`;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect('/settings?google_auth=error&message=missing_google_credentials');
  }

  try {
    // 用 code 換 tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.json().catch(() => ({}));
      console.error('Google token exchange 失敗:', err);
      return res.redirect('/settings?google_auth=error&message=' + encodeURIComponent(err.error_description || 'token_exchange_failed'));
    }

    const tokenData = await tokenResponse.json();
    console.log('Google token 取得成功, has refresh_token:', !!tokenData.refresh_token);

    if (!tokenData.refresh_token) {
      return res.redirect('/settings?google_auth=error&message=no_refresh_token_請先到myaccount.google.com/connections撤銷後重試');
    }

    // 存 refresh_token 到 system_settings
    await supabase
      .from('system_settings')
      .upsert({
        key: 'google_admin_refresh_token',
        value: tokenData.refresh_token,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    // 也存 access_token（短期用）
    await supabase
      .from('system_settings')
      .upsert({
        key: 'google_admin_access_token',
        value: tokenData.access_token,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    // 取得授權的 email
    try {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      if (profileRes.ok) {
        const profile = await profileRes.json();
        await supabase
          .from('system_settings')
          .upsert({
            key: 'google_admin_email',
            value: profile.email,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
      }
    } catch (e) {}

    console.log('✅ Google Calendar 授權成功，refresh_token 已存入');

    return res.redirect('/settings?google_auth=success');

  } catch (error) {
    console.error('Google callback 處理失敗:', error);
    return res.redirect('/settings?google_auth=error&message=' + encodeURIComponent(error.message));
  }
}
