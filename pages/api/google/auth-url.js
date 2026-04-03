// 產生 Google Calendar 授權 URL
// 獨立於 Supabase 登入，專門用來取得 Calendar + Drive 權限

export default function handler(req, res) {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://commission-system-delta.vercel.app';

  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: '缺少 GOOGLE_CLIENT_ID' });
  }

  const redirectUri = `${APP_URL}/api/google/callback`;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('scope', [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/drive.file'
  ].join(' '));

  return res.status(200).json({ url: url.toString() });
}
