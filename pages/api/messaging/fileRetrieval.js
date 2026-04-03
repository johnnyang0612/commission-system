// LINE 過期檔案取回 API
// 當使用者回覆一則過期檔案訊息並輸入「取回」「取檔」「找檔」時，
// 從 Supabase Storage 找到備份並重新發送連結

import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';
import { sendLineReply, sendLinePush } from '../../../utils/lineReply';

// API handler（可直接呼叫）
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { original_message_id, group_id, reply_token } = req.body;

  if (!original_message_id || !group_id) {
    return res.status(400).json({ error: '缺少必要參數 (original_message_id, group_id)' });
  }

  try {
    const result = await handleFileRetrieval(original_message_id, group_id, reply_token);
    return res.status(200).json(result);
  } catch (error) {
    console.error('檔案取回 API 錯誤:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * 處理檔案取回請求
 * @param {string} originalMessageId - 被引用的原始 LINE 訊息 ID
 * @param {string} groupId - LINE 群組 ID
 * @param {string} replyToken - LINE replyToken
 */
export async function handleFileRetrieval(originalMessageId, groupId, replyToken) {
  console.log('檔案取回: messageId=', originalMessageId, '群組:', groupId);

  if (!supabase) {
    const errMsg = '⚠️ 資料庫連線失敗，無法查詢檔案。';
    if (replyToken) await sendLineReply(replyToken, errMsg);
    return { success: false, error: '缺少 Supabase 連線' };
  }

  try {
    // 策略 1: 從 stored_files 查找（V2 格式，最完整）
    const { data: storedFile } = await supabase
      .from('stored_files')
      .select('*')
      .eq('source_message_id', originalMessageId)
      .single();

    if (storedFile) {
      return await sendStoredFile(storedFile, replyToken, groupId);
    }

    // 策略 2: 從 line_messages 查找（V1 格式，有 file_url）
    const { data: lineMsg } = await supabase
      .from('line_messages')
      .select('file_url, file_name, message_type')
      .eq('message_id', originalMessageId)
      .single();

    if (lineMsg?.file_url) {
      const fileName = lineMsg.file_name || getDefaultFileName(lineMsg.message_type);
      const replyText = `📎 已找到檔案備份！\n\n檔名：${fileName}\n下載連結：${lineMsg.file_url}`;

      if (replyToken) {
        await sendLineReply(replyToken, replyText);
      } else {
        await sendLinePush(groupId, replyText);
      }

      return { success: true, source: 'line_messages', file_name: fileName, file_url: lineMsg.file_url };
    }

    // 策略 3: 從 line_files 查找（舊版記錄）
    const { data: lineFile } = await supabase
      .from('line_files')
      .select('file_name, public_url, file_type')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1);

    // line_files 沒有 message_id 直接對應，這裡僅作為最後 fallback
    // 嘗試從 line_messages 找到同群組、同時間附近的檔案訊息
    const { data: origMsg } = await supabase
      .from('line_messages')
      .select('id, timestamp')
      .eq('message_id', originalMessageId)
      .single();

    if (origMsg) {
      // 用 line_messages 的 DB id 去找 line_files
      const { data: fileByMsgId } = await supabase
        .from('line_files')
        .select('file_name, public_url, file_type')
        .eq('message_id', origMsg.id)
        .single();

      if (fileByMsgId?.public_url) {
        const replyText = `📎 已找到檔案備份！\n\n檔名：${fileByMsgId.file_name || '檔案'}\n下載連結：${fileByMsgId.public_url}`;

        if (replyToken) {
          await sendLineReply(replyToken, replyText);
        } else {
          await sendLinePush(groupId, replyText);
        }

        return { success: true, source: 'line_files', file_name: fileByMsgId.file_name, file_url: fileByMsgId.public_url };
      }
    }

    // 找不到任何備份
    const notFoundMsg = '❌ 找不到此檔案的備份記錄。\n\n可能原因：\n• 該訊息不是檔案類型\n• 檔案在系統啟用前傳送\n• 儲存時發生錯誤';

    if (replyToken) {
      await sendLineReply(replyToken, notFoundMsg);
    } else {
      await sendLinePush(groupId, notFoundMsg);
    }

    return { success: false, error: '找不到檔案備份' };
  } catch (error) {
    console.error('檔案取回處理失敗:', error);

    const errMsg = '⚠️ 查詢檔案時發生錯誤，請稍後再試。';
    try {
      if (replyToken) {
        await sendLineReply(replyToken, errMsg);
      }
    } catch (replyErr) {
      console.error('錯誤回覆也失敗:', replyErr);
    }

    return { success: false, error: error.message };
  }
}

/**
 * 從 stored_files 取得 public URL 並回覆
 */
async function sendStoredFile(storedFile, replyToken, groupId) {
  // 取得 public URL
  const { data: urlData } = supabase.storage
    .from('chat-files')
    .getPublicUrl(storedFile.storage_key);

  const originalName = storedFile.original_file_name || storedFile.storage_key.split('/').pop();
  const fileSize = storedFile.file_size_bytes
    ? formatFileSize(storedFile.file_size_bytes)
    : '';

  let replyText = `📎 已找到檔案備份！\n\n檔名：${originalName}`;
  if (fileSize) replyText += `\n大小：${fileSize}`;
  replyText += `\n下載連結：${urlData.publicUrl}`;

  if (replyToken) {
    await sendLineReply(replyToken, replyText);
  } else {
    await sendLinePush(groupId, replyText);
  }

  return {
    success: true,
    source: 'stored_files',
    file_name: originalName,
    file_url: urlData.publicUrl,
    file_size: storedFile.file_size_bytes
  };
}

/**
 * 格式化檔案大小
 */
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 根據訊息類型取得預設檔名
 */
function getDefaultFileName(messageType) {
  switch (messageType) {
    case 'image': return '圖片';
    case 'video': return '影片';
    case 'audio': return '音訊';
    case 'file': return '檔案';
    default: return '檔案';
  }
}
