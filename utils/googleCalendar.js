// Google Calendar API 工具
// 使用儲存的 Admin Google refresh_token 來操作 Google Calendar
// 所有會議統一由管理員帳號建立，受邀者會收到日曆邀請

import { supabaseAdmin as supabase } from './supabaseAdmin';

// Google OAuth 設定（從 Supabase 的 Google provider 取得）
// 這些值在 Supabase Dashboard → Auth → Providers → Google 裡可以找到
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

/**
 * 從資料庫取得管理員的 Google refresh_token，用它換一個新的 access_token
 * 全系統共用同一個管理員帳號建立會議
 * @returns {string|null} 有效的 Google access token
 */
export async function getAdminGoogleAccessToken() {
  if (!supabase) return null;

  try {
    // 1. 從 system_settings 讀取存好的 refresh_token
    const { data: tokenSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'google_admin_refresh_token')
      .single();

    if (!tokenSetting?.value) {
      console.warn('⚠️ 尚未儲存管理員 Google token — 管理員需要重新登入系統一次');
      return null;
    }

    const refreshToken = tokenSetting.value;

    // 2. 用 refresh_token 換新的 access_token
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error('❌ 缺少 GOOGLE_CLIENT_ID 或 GOOGLE_CLIENT_SECRET 環境變數');
      console.error('請在 .env.local 加入這兩個值（與 Supabase Google Provider 設定相同）');
      return null;
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.json().catch(() => ({}));
      console.error('❌ Google token 刷新失敗:', err.error_description || err.error);
      if (err.error === 'invalid_grant') {
        console.error('refresh_token 已失效，管理員需要重新登入系統');
      }
      return null;
    }

    const tokenData = await tokenResponse.json();
    console.log('✅ Google access_token 已刷新');
    return tokenData.access_token;

  } catch (error) {
    console.error('取得 Google token 失敗:', error.message);
    return null;
  }
}

/**
 * 從 Supabase session 取得當前使用者的 Google access token（前端用）
 * @returns {string|null} Google access token
 */
export async function getGoogleAccessToken() {
  if (!supabase) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.provider_token) {
    console.warn('無法取得 Google access token — 使用者可能需要重新登入');
    return null;
  }

  return session.provider_token;
}

/**
 * 建立 Google Calendar 事件 + Google Meet 連結
 * @param {Object} params
 * @param {string} params.accessToken - Google OAuth access token
 * @param {string} params.title - 會議標題
 * @param {string} params.startTime - ISO 8601 開始時間
 * @param {string} params.endTime - ISO 8601 結束時間
 * @param {string} params.description - 會議描述（選填）
 * @param {string[]} params.attendeeEmails - 受邀者 email 陣列
 * @param {string} params.timeZone - 時區，預設 Asia/Taipei
 * @returns {Object} { success, eventId, meetUrl, htmlLink, attendees }
 */
export async function createCalendarEvent({
  accessToken,
  title,
  startTime,
  endTime,
  description = '',
  attendeeEmails = [],
  timeZone = 'Asia/Taipei'
}) {
  if (!accessToken) {
    return { success: false, error: '缺少 Google access token，請重新登入' };
  }

  try {
    // 建立事件資料
    const event = {
      summary: title,
      description,
      start: {
        dateTime: startTime,
        timeZone
      },
      end: {
        dateTime: endTime,
        timeZone
      },
      // 自動建立 Google Meet 連結
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      },
      // 受邀者
      attendees: attendeeEmails
        .filter(email => email && email.includes('@'))
        .map(email => ({ email })),
      // 自動發送邀請
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },   // 1 小時前提醒
          { method: 'popup', minutes: 1440 },  // 1 天前提醒
        ]
      }
    };

    // 呼叫 Google Calendar API
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      console.error('Google Calendar API 錯誤:', errorMessage);

      // Token 過期
      if (response.status === 401) {
        return { success: false, error: 'Google 授權已過期，請重新登入系統', needsReauth: true };
      }
      // 權限不足
      if (response.status === 403) {
        return { success: false, error: 'Google Calendar 權限不足，請重新登入並授權日曆存取', needsReauth: true };
      }

      return { success: false, error: `建立日曆事件失敗: ${errorMessage}` };
    }

    const eventData = await response.json();

    // 提取 Meet 連結
    const meetUrl = eventData.conferenceData?.entryPoints?.find(
      ep => ep.entryPointType === 'video'
    )?.uri || eventData.hangoutLink || null;

    console.log('✅ Google Calendar 事件已建立:', eventData.id, meetUrl);

    return {
      success: true,
      eventId: eventData.id,
      meetUrl,
      htmlLink: eventData.htmlLink,  // Google Calendar 網頁連結
      attendees: eventData.attendees?.map(a => ({
        email: a.email,
        responseStatus: a.responseStatus  // needsAction, accepted, declined, tentative
      })) || [],
      startTime: eventData.start?.dateTime,
      endTime: eventData.end?.dateTime
    };

  } catch (error) {
    console.error('建立 Google Calendar 事件失敗:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 更新 Google Calendar 事件
 * @param {Object} params
 * @param {string} params.accessToken
 * @param {string} params.eventId
 * @param {Object} params.updates - 要更新的欄位
 * @returns {Object}
 */
export async function updateCalendarEvent({ accessToken, eventId, updates }) {
  if (!accessToken || !eventId) {
    return { success: false, error: '缺少必要參數' };
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error?.message || `HTTP ${response.status}` };
    }

    const eventData = await response.json();
    return { success: true, event: eventData };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 刪除 / 取消 Google Calendar 事件
 * @param {Object} params
 * @param {string} params.accessToken
 * @param {string} params.eventId
 * @returns {Object}
 */
export async function deleteCalendarEvent({ accessToken, eventId }) {
  if (!accessToken || !eventId) {
    return { success: false, error: '缺少必要參數' };
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok && response.status !== 204) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.error?.message || `HTTP ${response.status}` };
    }

    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
}
