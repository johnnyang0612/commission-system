// LINE OA Webhook API
// 接收 LINE 群組訊息並自動記錄

import crypto from 'crypto';
import { supabase } from '../../../utils/supabaseClient';

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

export const config = {
  api: {
    bodyParser: false
  }
};

// 讀取 raw body
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 讀取 raw body
    const rawBody = await getRawBody(req);
    console.log('收到 webhook，body 長度:', rawBody.length);

    // 驗證 LINE 簽名
    const signature = req.headers['x-line-signature'];
    if (!verifySignature(rawBody, signature)) {
      console.error('Invalid LINE signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const body = JSON.parse(rawBody);
    const events = body.events || [];

    console.log(`收到 ${events.length} 個 LINE 事件`);

    // 處理每個事件
    for (const event of events) {
      await processLineEvent(event);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('LINE Webhook 錯誤:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// 驗證 LINE 簽名
function verifySignature(rawBody, signature) {
  if (!LINE_CHANNEL_SECRET) {
    console.warn('缺少 LINE_CHANNEL_SECRET，跳過驗證');
    return true;
  }
  if (!signature) {
    console.warn('缺少簽名，跳過驗證');
    return true;
  }

  const hash = crypto
    .createHmac('SHA256', LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest('base64');

  const isValid = hash === signature;
  if (!isValid) {
    console.log('簽名驗證失敗 - expected:', hash, 'got:', signature);
  }
  return isValid;
}

// 處理 LINE 事件
async function processLineEvent(event) {
  const { type, source, timestamp, replyToken } = event;

  console.log('處理事件:', type, source?.type, source?.groupId);

  // 只處理群組事件
  if (source?.type !== 'group') {
    console.log('非群組事件，跳過');
    return;
  }

  const groupId = source.groupId;
  const userId = source.userId;

  switch (type) {
    case 'join':
      // 機器人被邀請加入群組
      await handleJoinEvent(groupId);
      break;

    case 'leave':
      // 機器人離開群組
      await handleLeaveEvent(groupId);
      break;

    case 'message':
      // 收到訊息
      await handleMessageEvent(event, groupId, userId);
      break;

    case 'memberJoined':
      // 成員加入
      console.log('成員加入群組:', groupId);
      break;

    case 'memberLeft':
      // 成員離開
      console.log('成員離開群組:', groupId);
      break;

    default:
      console.log('未處理的事件類型:', type);
  }
}

// 處理加入群組事件
async function handleJoinEvent(groupId) {
  console.log('機器人加入群組:', groupId);

  // 取得群組資訊
  const groupInfo = await getLineGroupInfo(groupId);

  // 記錄到資料庫
  const { error } = await supabase
    .from('line_groups')
    .upsert({
      group_id: groupId,
      group_name: groupInfo?.groupName || '未命名群組',
      is_active: true,
      joined_at: new Date().toISOString()
    }, {
      onConflict: 'group_id'
    });

  if (error) {
    console.error('記錄群組失敗:', error);
  } else {
    console.log('已記錄群組:', groupId);
  }
}

// 處理離開群組事件
async function handleLeaveEvent(groupId) {
  console.log('機器人離開群組:', groupId);

  const { error } = await supabase
    .from('line_groups')
    .update({
      is_active: false,
      left_at: new Date().toISOString()
    })
    .eq('group_id', groupId);

  if (error) {
    console.error('更新群組狀態失敗:', error);
  }
}

// 處理訊息事件
async function handleMessageEvent(event, groupId, userId) {
  const { message, timestamp, replyToken } = event;

  // 處理設定指令
  if (message.type === 'text' && (message.text.startsWith('/設定') || message.text.startsWith('/setup'))) {
    try {
      const { handleSetupCommand } = await import('./setupCommand.js');
      const handled = await handleSetupCommand(message.text, groupId, replyToken);
      if (handled) {
        console.log('已處理設定指令');
        // 仍然儲存訊息記錄，但不做其他處理
      }
    } catch (e) {
      console.error('設定指令處理失敗:', e);
    }
  }

  // 取得發送者資訊
  const senderProfile = await getLineUserProfile(groupId, userId);

  // 判斷是客戶還是員工 (簡單判斷，可以之後優化)
  const senderType = await determineSenderType(userId, senderProfile);

  // 追蹤群組成員（自動偵測 PO）
  if (senderType === 'staff') {
    try {
      const { trackGroupMember } = await import('./trackMember.js');
      const result = await trackGroupMember(groupId, userId, senderType);
      if (result?.isNew && result?.isProjectOwner) {
        console.log(`🎯 自動偵測 PO: ${result.user.name}`);
      }
    } catch (e) {
      console.log('成員追蹤跳過:', e.message);
    }
  }

  // 基本訊息資料
  const messageData = {
    group_id: groupId,
    message_id: message.id,
    reply_token: replyToken,
    sender_id: userId,
    sender_name: senderProfile?.displayName || '未知',
    sender_type: senderType,
    sender_avatar_url: senderProfile?.pictureUrl,
    message_type: message.type,
    timestamp: new Date(timestamp).toISOString()
  };

  // 根據訊息類型處理
  switch (message.type) {
    case 'text':
      messageData.content = message.text;
      break;

    case 'image':
    case 'video':
    case 'audio':
    case 'file':
      // 下載並儲存檔案
      const fileInfo = await downloadAndSaveFile(message, groupId);
      if (fileInfo) {
        messageData.file_name = fileInfo.fileName;
        messageData.file_size = fileInfo.fileSize;
        messageData.file_url = fileInfo.publicUrl;
        messageData.file_original_url = fileInfo.originalUrl;
      }
      if (message.duration) {
        messageData.duration = message.duration / 1000; // 轉為秒
      }
      if (message.fileName) {
        messageData.file_name = message.fileName;
      }
      break;

    case 'sticker':
      messageData.sticker_id = message.stickerId;
      messageData.sticker_package_id = message.packageId;
      break;

    case 'location':
      messageData.latitude = message.latitude;
      messageData.longitude = message.longitude;
      messageData.address = message.address;
      messageData.content = message.title || message.address;
      break;
  }

  // 儲存訊息
  const { data, error } = await supabase
    .from('line_messages')
    .insert([messageData])
    .select()
    .single();

  if (error) {
    console.error('儲存訊息失敗:', error);
  } else {
    console.log('已儲存訊息:', message.type, messageData.content?.substring(0, 50) || '(檔案)');

    // 如果是檔案，記錄到 line_files
    if (['image', 'video', 'audio', 'file'].includes(message.type) && messageData.file_url) {
      await saveFileRecord(data.id, groupId, messageData, senderProfile);
    }

    // 如果是文字訊息，嘗試偵測會議時間
    if (message.type === 'text' && messageData.content && messageData.content.length > 10) {
      try {
        const { detectMeetingFromText } = await import('./detectMeeting.js');
        await detectMeetingFromText(messageData.content, groupId, data.id);
      } catch (e) {
        // 會議偵測失敗不影響主流程
        console.log('會議偵測跳過:', e.message);
      }
    }
  }
}

// 取得 LINE 群組資訊
async function getLineGroupInfo(groupId) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) return null;

  try {
    const response = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('取得群組資訊失敗:', error);
  }
  return null;
}

// 取得 LINE 用戶資訊
async function getLineUserProfile(groupId, userId) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !userId) return null;

  try {
    const response = await fetch(`https://api.line.me/v2/bot/group/${groupId}/member/${userId}`, {
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('取得用戶資訊失敗:', error);
  }
  return null;
}

// 判斷發送者類型
async function determineSenderType(userId, profile) {
  // 檢查是否為系統記錄的員工
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('line_user_id', userId)
    .single();

  if (user) {
    return 'staff';
  }

  // 預設為客戶
  return 'customer';
}

// 下載並儲存檔案
async function downloadAndSaveFile(message, groupId) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.warn('缺少 LINE_CHANNEL_ACCESS_TOKEN，無法下載檔案');
    return null;
  }

  try {
    // 從 LINE 下載檔案
    const response = await fetch(`https://api-data.line.me/v2/bot/message/${message.id}/content`, {
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      console.error('下載檔案失敗:', response.status);
      return null;
    }

    const contentType = response.headers.get('content-type');
    const buffer = await response.arrayBuffer();

    // 產生檔案名稱
    const ext = getExtensionFromMimeType(contentType, message.type);
    const fileName = message.fileName || `${message.type}_${message.id}${ext}`;
    const storagePath = `chat/${groupId}/${Date.now()}_${fileName}`;

    // 上傳到 Supabase Storage
    const { data, error } = await supabase.storage
      .from('chat-files')
      .upload(storagePath, Buffer.from(buffer), {
        contentType: contentType,
        upsert: false
      });

    if (error) {
      console.error('上傳到 Storage 失敗:', error);
      return null;
    }

    // 取得公開 URL
    const { data: urlData } = supabase.storage
      .from('chat-files')
      .getPublicUrl(storagePath);

    return {
      fileName,
      fileSize: buffer.byteLength,
      publicUrl: urlData.publicUrl,
      originalUrl: `https://api-data.line.me/v2/bot/message/${message.id}/content`,
      storagePath,
      mimeType: contentType
    };
  } catch (error) {
    console.error('處理檔案失敗:', error);
    return null;
  }
}

// 從 MIME type 取得副檔名
function getExtensionFromMimeType(mimeType, messageType) {
  const mimeToExt = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'audio/m4a': '.m4a',
    'audio/mp3': '.mp3',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
  };

  if (mimeToExt[mimeType]) {
    return mimeToExt[mimeType];
  }

  // 根據訊息類型給預設
  switch (messageType) {
    case 'image': return '.jpg';
    case 'video': return '.mp4';
    case 'audio': return '.m4a';
    default: return '';
  }
}

// 儲存檔案記錄
async function saveFileRecord(messageId, groupId, messageData, senderProfile) {
  // 取得關聯的 prospect
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

// 判斷檔案類型
function getFileType(fileName, messageType) {
  if (!fileName) {
    return messageType; // image, video, audio
  }

  const ext = fileName.split('.').pop()?.toLowerCase();
  const extToType = {
    'pdf': 'pdf',
    'doc': 'word',
    'docx': 'word',
    'xls': 'excel',
    'xlsx': 'excel',
    'ppt': 'powerpoint',
    'pptx': 'powerpoint',
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'gif': 'image',
    'mp4': 'video',
    'mov': 'video',
    'mp3': 'audio',
    'm4a': 'audio'
  };

  return extToType[ext] || 'other';
}
