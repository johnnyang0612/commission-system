// 共用 LINE 回覆工具
// 提供 reply（replyToken）及 push（groupId）兩種發送方式

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

/**
 * 使用 replyToken 回覆 LINE 訊息
 * @param {string} replyToken
 * @param {string} text - 文字內容（最多 5000 字元）
 */
export async function sendLineReply(replyToken, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !replyToken) {
    console.warn('sendLineReply: 缺少 token 或 replyToken，無法回覆');
    return;
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text: text.substring(0, 5000) }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('LINE 回覆失敗:', err);
    }
  } catch (error) {
    console.error('發送 LINE 回覆錯誤:', error);
  }
}

/**
 * 使用 push message 發送訊息到 LINE 群組
 * @param {string} groupId
 * @param {string} text
 */
export async function sendLinePush(groupId, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !groupId) {
    console.warn('sendLinePush: 缺少 token 或 groupId，無法推送');
    return;
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: 'text', text: text.substring(0, 5000) }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('LINE 推送失敗:', err);
    }
  } catch (error) {
    console.error('發送 LINE 推送錯誤:', error);
  }
}
