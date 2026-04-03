// 檔案回溯 API
// 補下載之前沒有成功儲存的 LINE 檔案

import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    return res.status(500).json({ error: '缺少 LINE_CHANNEL_ACCESS_TOKEN' });
  }

  const { groupId, limit = 100 } = req.body;

  try {
    // 查詢所有檔案類型的訊息，但沒有 file_url 的
    let query = supabase
      .from('line_messages')
      .select('*')
      .in('message_type', ['image', 'video', 'audio', 'file'])
      .is('file_url', null)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (groupId) {
      query = query.eq('group_id', groupId);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('查詢訊息失敗:', error);
      return res.status(500).json({ error: '查詢失敗', details: error.message });
    }

    console.log(`找到 ${messages.length} 則沒有檔案 URL 的訊息`);

    const results = {
      total: messages.length,
      success: 0,
      failed: 0,
      expired: 0,
      errors: []
    };

    // 逐一嘗試下載
    for (const message of messages) {
      console.log(`\n處理訊息: ${message.id} (${message.message_type})`);

      try {
        const fileInfo = await downloadAndSaveFile(message);

        if (fileInfo === 'expired') {
          results.expired++;
          console.log(`❌ 檔案已過期: ${message.message_id}`);
        } else if (fileInfo) {
          // 更新訊息記錄
          const { error: updateError } = await supabase
            .from('line_messages')
            .update({
              file_name: fileInfo.fileName,
              file_size: fileInfo.fileSize,
              file_url: fileInfo.publicUrl,
              file_original_url: fileInfo.originalUrl
            })
            .eq('id', message.id);

          if (updateError) {
            console.error('更新訊息失敗:', updateError);
            results.failed++;
            results.errors.push(`更新訊息 ${message.id} 失敗: ${updateError.message}`);
          } else {
            results.success++;
            console.log(`✅ 成功下載: ${fileInfo.fileName}`);

            // 同時儲存到 line_files
            await saveFileRecord(message.id, message.group_id, {
              file_name: fileInfo.fileName,
              file_size: fileInfo.fileSize,
              file_url: fileInfo.publicUrl,
              message_type: message.message_type,
              sender_id: message.sender_id
            }, {
              displayName: message.sender_name
            });
          }
        } else {
          results.failed++;
          results.errors.push(`下載失敗: 訊息 ${message.id}`);
        }

        // 避免 API rate limit，每個檔案間隔 200ms
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        results.failed++;
        results.errors.push(`處理訊息 ${message.id} 時發生錯誤: ${error.message}`);
        console.error(`處理訊息 ${message.id} 失敗:`, error);
      }
    }

    return res.status(200).json(results);
  } catch (error) {
    console.error('回溯失敗:', error);
    return res.status(500).json({ error: '回溯失敗', details: error.message });
  }
}

// 下載並儲存檔案（從 webhook.js 複製並修改）
async function downloadAndSaveFile(message) {
  const { message_id, message_type, group_id, file_name: existingFileName } = message;

  console.log(`📥 嘗試下載檔案: type=${message_type}, id=${message_id}`);

  try {
    // 從 LINE 下載檔案
    const downloadUrl = `https://api-data.line.me/v2/bot/message/${message_id}/content`;
    console.log(`🌐 下載 URL: ${downloadUrl}`);

    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });

    // 檔案已過期（LINE 通常保留 7 天）
    if (response.status === 404) {
      console.log('⏰ LINE 檔案已過期 (404)');
      return 'expired';
    }

    if (!response.ok) {
      console.error(`❌ LINE API 下載失敗: HTTP ${response.status} ${response.statusText}`);
      return null;
    }

    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');
    console.log(`📦 收到檔案: type=${contentType}, size=${contentLength} bytes`);

    const buffer = await response.arrayBuffer();
    console.log(`💾 已讀取檔案到記憶體: ${buffer.byteLength} bytes`);

    // 產生檔案名稱
    const ext = getExtensionFromMimeType(contentType, message_type);
    const fileName = existingFileName || `${message_type}_${message_id}${ext}`;
    // Storage 路徑只用英文（避免中文檔名導致上傳失敗），原始檔名存 DB
    const safeFileName = `${message_type}_${message_id}${ext}`;
    const storagePath = `chat/${group_id}/${Date.now()}_${safeFileName}`;

    console.log(`📂 準備上傳到 Storage: path=${storagePath}`);

    // 上傳到 Supabase Storage
    const { data, error } = await supabase.storage
      .from('chat-files')
      .upload(storagePath, Buffer.from(buffer), {
        contentType: contentType,
        upsert: false
      });

    if (error) {
      console.error('❌ 上傳到 Supabase Storage 失敗:', {
        error: error.message,
        code: error.statusCode
      });
      return null;
    }

    console.log(`✅ Storage 上傳成功: ${data.path}`);

    // 取得公開 URL
    const { data: urlData } = supabase.storage
      .from('chat-files')
      .getPublicUrl(storagePath);

    const result = {
      fileName,
      fileSize: buffer.byteLength,
      publicUrl: urlData.publicUrl,
      originalUrl: downloadUrl,
      storagePath,
      mimeType: contentType
    };

    return result;
  } catch (error) {
    console.error('❌ 處理檔案時發生異常:', error);
    return null;
  }
}

// MIME type 轉副檔名
function getExtensionFromMimeType(mimeType, messageType) {
  const mimeToExt = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'audio/m4a': '.m4a',
    'audio/mp3': '.mp3',
    'audio/mpeg': '.mp3',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/x-7z-compressed': '.7z'
  };

  if (mimeToExt[mimeType]) {
    return mimeToExt[mimeType];
  }

  switch (messageType) {
    case 'image': return '.jpg';
    case 'video': return '.mp4';
    case 'audio': return '.m4a';
    default: return '';
  }
}

// 儲存檔案記錄
async function saveFileRecord(messageId, groupId, messageData, senderProfile) {
  const { data: group } = await supabase
    .from('line_groups')
    .select('prospect_id, project_id')
    .eq('group_id', groupId)
    .single();

  const fileData = {
    message_id: messageId,
    group_id: groupId,
    prospect_id: group?.prospect_id,
    project_id: group?.project_id,
    file_name: messageData.file_name,
    file_type: getFileType(messageData.file_name, messageData.message_type),
    file_size: messageData.file_size,
    public_url: messageData.file_url,
    uploaded_by_name: senderProfile?.displayName || '未知',
    uploaded_by_id: messageData.sender_id
  };

  const { error } = await supabase
    .from('line_files')
    .insert([fileData]);

  if (error) {
    console.error('儲存檔案記錄失敗:', error);
  } else {
    console.log('已儲存檔案記錄:', messageData.file_name);
  }
}

function getFileType(fileName, messageType) {
  if (!fileName) return messageType;

  const ext = fileName.split('.').pop()?.toLowerCase();
  const extToType = {
    'pdf': 'pdf',
    'doc': 'word',
    'docx': 'word',
    'xls': 'excel',
    'xlsx': 'excel',
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'gif': 'image',
    'mp4': 'video',
    'mov': 'video',
    'mp3': 'audio',
    'm4a': 'audio',
    'zip': 'archive',
    'rar': 'archive',
    '7z': 'archive'
  };

  return extToType[ext] || 'other';
}
