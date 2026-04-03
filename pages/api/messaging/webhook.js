// LINE OA Webhook API
// 接收 LINE 群組訊息並自動記錄

import crypto from 'crypto';
import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// Helper: check if LINE user is a registered employee
async function isEmployeeUser(lineUserId) {
  if (!lineUserId) return { isEmployee: false };

  const { data: user } = await supabase
    .from('users')
    .select('id, role')
    .eq('line_user_id', lineUserId)
    .single();

  return user ? { isEmployee: true, role: user.role, userId: user.id } : { isEmployee: false };
}

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

  // 處理私訊事件（1 對 1）— 支援提醒、問答、help
  if (source?.type === 'user' && type === 'message') {
    await handlePrivateMessage(event, source.userId);
    return;
  }

  // 群組事件
  if (source?.type !== 'group') {
    console.log('非群組/非私訊事件，跳過:', source?.type);
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

  // ===== 會議指令處理（支援自然語言 + 嚴格指令）=====
  // 使用 quickDetectIntent 快速判斷，模糊輸入時用 AI 解析
  if (message.type === 'text') {
    try {
      const { quickDetectIntent, parseMeetingIntent, aiResultToMeetingParams } = await import('../../../utils/commandParser.js');
      const detected = quickDetectIntent(message.text);

      if (detected.type === 'create_meeting' || detected.type === 'modify_meeting' || detected.type === 'cancel_meeting') {
        const employeeCheck = await isEmployeeUser(userId);
        if (!employeeCheck.isEmployee) {
          console.log(`非員工嘗試 ${detected.type}，跳過`);
        } else {
          // 如果是模糊輸入，先用 AI 解析
          if (detected.shouldUseAI) {
            console.log('🧠 使用 AI 解析自然語言會議指令:', message.text);
            const aiResult = await parseMeetingIntent(message.text);

            if (aiResult && aiResult.confidence >= 0.5) {
              const params = aiResultToMeetingParams(aiResult);
              if (params) {
                const { handleMeetingCommand, handleModifyMeetingCommand, handleCancelMeetingCommand } = await import('./meetingCommand.js');

                if (aiResult.intent === 'create' && params.startTime) {
                  // 把 AI 解析結果轉成標準指令格式，交給現有 handler
                  const syntheticCmd = buildSyntheticCommand(params);
                  await handleMeetingCommand(syntheticCmd, groupId, userId, replyToken);
                } else if (aiResult.intent === 'modify') {
                  const syntheticCmd = buildModifyCommand(params);
                  await handleModifyMeetingCommand(syntheticCmd, groupId, userId, replyToken);
                } else if (aiResult.intent === 'cancel') {
                  const syntheticCmd = buildCancelCommand(params);
                  await handleCancelMeetingCommand(syntheticCmd, groupId, userId, replyToken);
                }
              }
            } else {
              console.log('AI 解析信心度不足，跳過:', aiResult?.confidence);
            }
          } else {
            // 嚴格指令格式，直接路由
            const { handleMeetingCommand, handleModifyMeetingCommand, handleCancelMeetingCommand } = await import('./meetingCommand.js');

            if (detected.type === 'create_meeting') {
              await handleMeetingCommand(message.text, groupId, userId, replyToken);
            } else if (detected.type === 'modify_meeting') {
              await handleModifyMeetingCommand(message.text, groupId, userId, replyToken);
            } else if (detected.type === 'cancel_meeting') {
              await handleCancelMeetingCommand(message.text, groupId, userId, replyToken);
            }
          }
        }
      }
    } catch (e) {
      console.error('會議指令處理失敗:', e);
    }
  }

  // ===== Help 指令 — 私訊教學給使用者 =====
  if (message.type === 'text' && (
    /(@川輝|川輝AI|@川輝AI助理).*(help|幫助|協助|教學|使用說明)/i.test(message.text) ||
    /^\/help/i.test(message.text) ||
    /^\/幫助/.test(message.text) ||
    /^\/協助/.test(message.text)
  )) {
    try {
      const { handleHelpCommand } = await import('./helpCommand.js');
      // 提取特定主題（如 help 會議、help email）
      const topicMatch = message.text.match(/(?:help|幫助|協助|教學|使用說明)\s*(.+)?$/i);
      const topic = topicMatch?.[1]?.trim() || '';
      await handleHelpCommand(userId, replyToken, topic);
    } catch (e) {
      console.error('Help 指令處理失敗:', e);
    }
  }

  // ===== 提醒指令 =====
  if (message.type === 'text' && (
    message.text.startsWith('/建立提醒') ||
    message.text.startsWith('/提醒') ||
    message.text.startsWith('/remind') ||
    /^提醒我/.test(message.text) ||
    /^提醒\s*@/.test(message.text) ||
    /^提醒(大家|所有人)/.test(message.text) ||
    /^記得/.test(message.text) ||
    /^下.+前.*提醒/.test(message.text) ||
    /提醒.+(前|點|時)/.test(message.text)
  )) {
    const employeeCheck = await isEmployeeUser(userId);
    if (!employeeCheck.isEmployee) {
      console.log('非員工嘗試建立提醒，跳過');
    } else {
      try {
        const senderProfile2 = await getLineUserProfile(groupId, userId);
        const { handleReminderCommand } = await import('./reminderCommand.js');
        await handleReminderCommand(message.text, groupId, userId, senderProfile2?.displayName || '未知', replyToken);
      } catch (e) {
        console.error('提醒指令處理失敗:', e);
      }
    }
  }

  // 取消提醒
  if (message.type === 'text' && (
    message.text.startsWith('/取消提醒') ||
    /取消.*提醒/.test(message.text)
  )) {
    const employeeCheck = await isEmployeeUser(userId);
    if (employeeCheck.isEmployee) {
      try {
        const { handleCancelReminderCommand } = await import('./reminderCommand.js');
        await handleCancelReminderCommand(message.text, groupId, userId, replyToken);
      } catch (e) {
        console.error('取消提醒指令處理失敗:', e);
      }
    }
  }

  // 查看提醒
  if (message.type === 'text' && (
    message.text.startsWith('/查看提醒') ||
    message.text.startsWith('/提醒列表') ||
    /查看.*提醒/.test(message.text) ||
    /有(哪些|什麼)提醒/.test(message.text)
  )) {
    try {
      const { handleListRemindersCommand } = await import('./reminderCommand.js');
      await handleListRemindersCommand(groupId, replyToken);
    } catch (e) {
      console.error('查看提醒指令處理失敗:', e);
    }
  }

  // 處理設定指令 - 僅限員工
  if (message.type === 'text' && (message.text.startsWith('/設定') || message.text.startsWith('/setup'))) {
    const employeeCheck = await isEmployeeUser(userId);
    if (!employeeCheck.isEmployee) {
      console.log('非員工嘗試設定指令，跳過');
    } else {
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
  }

  // 處理 Email 綁定指令 - 僅限員工
  if (message.type === 'text' && (
    message.text.includes('綁定Email') ||
    message.text.includes('綁定email') ||
    message.text.includes('綁定 Email') ||
    message.text.includes('綁定 email') ||
    message.text.startsWith('/綁定')
  )) {
    const employeeCheck = await isEmployeeUser(userId);
    if (!employeeCheck.isEmployee) {
      console.log('非員工嘗試綁定Email，跳過');
    } else {
      try {
        const senderProfile = await getLineUserProfile(groupId, userId);
        const { handleEmailBindCommand } = await import('./emailBindCommand.js');
        await handleEmailBindCommand(message.text, groupId, userId, senderProfile?.displayName || '未知', replyToken);
        console.log('已處理 Email 綁定指令');
        // Still save the message below
      } catch (e) {
        console.error('Email 綁定指令處理失敗:', e);
      }
    }
  }

  // 知識問答 - 觸發條件: @川輝、川輝AI、/問、/ask (唯讀操作，允許所有群組成員)
  if (message.type === 'text' && (
    message.text.includes('@川輝') ||
    message.text.includes('川輝AI') ||
    message.text.startsWith('/問') ||
    message.text.startsWith('/ask')
  )) {
    const employeeCheck = await isEmployeeUser(userId);
    if (!employeeCheck.isEmployee) {
      const senderInfo = await getLineUserProfile(groupId, userId);
      console.log('非員工知識問答:', senderInfo?.displayName || userId);
    }
    try {
      const { handleKnowledgeQuery } = await import('./knowledgeQuery.js');
      const query = message.text
        .replace(/@川輝AI助理/g, '')
        .replace(/@川輝/g, '')
        .replace(/川輝AI/g, '')
        .replace(/^\/問\s*/, '')
        .replace(/^\/ask\s*/i, '')
        .trim();
      if (query.length > 2) {
        await handleKnowledgeQuery(query, groupId, userId, replyToken);
        console.log('已處理知識問答:', query.substring(0, 30));
      }
    } catch (e) {
      console.error('知識問答處理失敗:', e);
    }
  }

  // 檔案取回 - 觸發條件: 引用訊息 + 「取回」「取檔」「找檔」 (唯讀操作，允許所有群組成員)
  if (message.type === 'text' &&
    (message.text.includes('取回') || message.text.includes('取檔') || message.text.includes('找檔')) &&
    message.quotedMessageId
  ) {
    const employeeCheck = await isEmployeeUser(userId);
    if (!employeeCheck.isEmployee) {
      const senderInfo = await getLineUserProfile(groupId, userId);
      console.log('非員工檔案取回:', senderInfo?.displayName || userId);
    }
    try {
      const { handleFileRetrieval } = await import('./fileRetrieval.js');
      await handleFileRetrieval(message.quotedMessageId, groupId, replyToken);
      console.log('已處理檔案取回, 引用訊息:', message.quotedMessageId);
    } catch (e) {
      console.error('檔案取回處理失敗:', e);
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

  // Auto-register as group participant via contact_identities
  try {
    const { data: identity } = await supabase
      .from('contact_identities')
      .select('id')
      .eq('line_user_id', userId)
      .single();

    if (identity) {
      await supabase
        .from('group_participants')
        .upsert({
          line_group_id: groupId,
          identity_id: identity.id,
          role_in_group: senderType === 'staff' ? 'member' : 'client_contact',
          joined_at: new Date().toISOString()
        }, {
          onConflict: 'line_group_id,identity_id'
        });
    }
  } catch (gpError) {
    // Don't fail the main flow
    console.log('group_participants upsert 跳過:', gpError.message);
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

// 確保 contact_identities 記錄存在
async function ensureContactIdentity(lineUserId, profile, identityType, internalUserId) {
  if (!lineUserId) return null;

  try {
    // Check if already exists
    const { data: existing } = await supabase
      .from('contact_identities')
      .select('id')
      .eq('line_user_id', lineUserId)
      .single();

    if (existing) {
      // Update display_name if changed
      if (profile?.displayName) {
        await supabase
          .from('contact_identities')
          .update({
            display_name: profile.displayName,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      }
      return existing.id;
    }

    // Create new
    const { data: newIdentity, error } = await supabase
      .from('contact_identities')
      .insert([{
        line_user_id: lineUserId,
        display_name: profile?.displayName || '未知',
        identity_type: identityType,
        internal_user_id: internalUserId,
        is_manually_verified: identityType === 'employee' // auto-verify employees
      }])
      .select()
      .single();

    if (error) {
      console.error('建立 contact_identity 失敗:', error.message);
      return null;
    }

    console.log(`📇 自動建立聯絡人: ${profile?.displayName || lineUserId} (${identityType})`);
    return newIdentity?.id;
  } catch (e) {
    console.error('ensureContactIdentity 錯誤:', e.message);
    return null;
  }
}

// 判斷發送者類型
async function determineSenderType(userId, profile) {
  if (!userId) return 'unknown';

  // 1. Check users table (existing logic)
  const { data: user } = await supabase
    .from('users')
    .select('id, name')
    .eq('line_user_id', userId)
    .single();

  if (user) {
    // Also ensure contact_identities has this employee
    await ensureContactIdentity(userId, profile, 'employee', user.id);
    return 'staff';
  }

  // 2. Check contact_identities table
  const { data: identity } = await supabase
    .from('contact_identities')
    .select('id, identity_type, is_manually_verified')
    .eq('line_user_id', userId)
    .single();

  if (identity) {
    // Return type based on identity
    if (identity.identity_type === 'employee') return 'staff';
    if (identity.identity_type === 'vip') return 'vip';
    return 'customer';
  }

  // 3. Auto-create contact_identities for unknown sender
  await ensureContactIdentity(userId, profile, 'unknown', null);
  return 'customer';
}

// 下載並儲存檔案
async function downloadAndSaveFile(message, groupId) {
  console.log(`📥 開始下載檔案: type=${message.type}, id=${message.id}, fileName=${message.fileName}`);

  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.error('❌ 缺少 LINE_CHANNEL_ACCESS_TOKEN，無法下載檔案');
    return null;
  }

  try {
    // 從 LINE 下載檔案
    const downloadUrl = `https://api-data.line.me/v2/bot/message/${message.id}/content`;
    console.log(`🌐 下載 URL: ${downloadUrl}`);

    const response = await fetch(downloadUrl, {
      headers: {
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      }
    });

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
    const ext = getExtensionFromMimeType(contentType, message.type);
    const fileName = message.fileName || `${message.type}_${message.id}${ext}`;
    // Storage 路徑只用英文（避免中文檔名導致上傳失敗），原始檔名存 DB
    const safeFileName = `${message.type}_${message.id}${ext}`;
    const storagePath = `chat/${groupId}/${Date.now()}_${safeFileName}`;

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
        code: error.statusCode,
        hint: error.hint,
        details: error.details
      });
      return null;
    }

    console.log(`✅ Storage 上傳成功: ${data.path}`);

    // 取得公開 URL
    const { data: urlData } = supabase.storage
      .from('chat-files')
      .getPublicUrl(storagePath);

    console.log(`🔗 公開 URL: ${urlData.publicUrl}`);

    // Save to stored_files table for V2 metadata tracking
    try {
      await supabase
        .from('stored_files')
        .insert([{
          storage_key: storagePath,
          original_file_name: message.fileName || fileName,
          mime_type: contentType,
          file_extension: ext,
          file_size_bytes: buffer.byteLength,
          source_type: 'line',
          source_message_id: message.id,
          source_group_id: groupId
        }]);
      console.log('✅ 已記錄到 stored_files:', message.fileName || fileName);
    } catch (sfError) {
      console.error('⚠️ stored_files 記錄失敗 (不影響主流程):', sfError.message);
    }

    const result = {
      fileName,
      fileSize: buffer.byteLength,
      publicUrl: urlData.publicUrl,
      originalUrl: downloadUrl,
      storagePath,
      mimeType: contentType
    };

    console.log(`✅ 檔案下載完成:`, result);
    return result;
  } catch (error) {
    console.error('❌ 處理檔案時發生異常:', {
      message: error.message,
      stack: error.stack
    });
    return null;
  }
}

// ===== 私訊處理（1 對 1）=====
// 員工：提醒、問答、help
// Admin：以上 + 完整 AI Agent 操作（建案、綁群組、查全公司資料等）
async function handlePrivateMessage(event, userId) {
  const { message, replyToken } = event;
  if (message.type !== 'text') return;

  console.log(`📩 收到私訊: type=${message.type} from ${userId}`);

  // 驗證身份
  const employeeCheck = await isEmployeeUser(userId);

  // === Admin 傳檔案 → 智能建案 ===
  if (['file', 'image'].includes(message.type) && employeeCheck.isEmployee && employeeCheck.role === 'admin') {
    await handleAdminFileUpload(message, userId, employeeCheck.userId, event.replyToken);
    return;
  }

  // 非文字訊息到此結束
  if (message.type !== 'text') return;

  const text = message.text.trim();

  // === Help（所有人可用）===
  if (/help|幫助|協助|教學|使用說明/i.test(text)) {
    try {
      const { handleHelpCommand } = await import('./helpCommand.js');
      const topicMatch = text.match(/(?:help|幫助|協助|教學|使用說明)\s*(.+)?$/i);
      const topic = topicMatch?.[1]?.trim() || '';
      await handleHelpCommand(userId, null, topic);
      await sendReply(replyToken, '📖 教學已傳送，請查看上方訊息！');
    } catch (e) {
      console.error('私訊 help 處理失敗:', e);
    }
    return;
  }

  // 非員工擋掉
  if (!employeeCheck.isEmployee) {
    await sendReply(replyToken, '此功能僅限公司內部人員使用。\n如需協助請聯繫管理員。');
    return;
  }

  // === 提醒指令（所有員工可用）===
  if (/^\/建立提醒|^\/提醒|^\/remind|^提醒我|^記得/.test(text) || /提醒.+(前|點|時)/.test(text)) {
    try {
      const { handleReminderCommand } = await import('./reminderCommand.js');
      const senderName = await getUserDisplayName(userId);
      await handleReminderCommand(text, null, userId, senderName, replyToken);
    } catch (e) {
      await sendReply(replyToken, '❌ 建立提醒失敗，請稍後再試');
    }
    return;
  }

  if (/^\/查看提醒|^\/提醒列表|查看.*提醒|有(哪些|什麼)提醒|我的提醒/.test(text)) {
    try {
      const { handleListPersonalReminders } = await import('./reminderCommand.js');
      await handleListPersonalReminders(userId, replyToken);
    } catch (e) {}
    return;
  }

  if (/^\/取消提醒|取消.*提醒/.test(text)) {
    try {
      const { handleCancelPersonalReminder } = await import('./reminderCommand.js');
      await handleCancelPersonalReminder(text, userId, replyToken);
    } catch (e) {}
    return;
  }

  // ===== Admin: 檢查是否有進行中的建案對話 =====
  if (employeeCheck.role === 'admin') {
    const { data: pendingState } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', `pending_extraction_${userId}`)
      .single();

    if (pendingState?.value) {
      // 有進行中的建案流程
      if (/^取消$|^不建案$|^算了$|^放棄$/.test(text)) {
        await supabase.from('system_settings').delete().eq('key', `pending_extraction_${userId}`);
        await sendReply(replyToken, '✅ 已取消建案流程。');
        return;
      }

      if (/^確認建案|^確認$|^建案$|^OK$|^好$|^執行$/i.test(text)) {
        await handleConfirmProjectCreation(userId, employeeCheck.userId, replyToken);
        return;
      }

      // 其他回覆 → 視為對 AI 追問的回答，進入多輪對話
      await handleProjectConversation(text, userId, employeeCheck.userId, replyToken, pendingState.value);
      return;
    }

    // 沒有進行中的建案 → 一般 AI Agent
    await handleAdminAgentMessage(text, userId, employeeCheck.userId, replyToken);
    return;
  }

  // === 一般員工問答 ===
  try {
    const { handleKnowledgeQuery } = await import('./knowledgeQuery.js');
    await handleKnowledgeQuery(text, null, userId, replyToken);
  } catch (e) {
    await sendReply(replyToken, `嗨！我是川輝AI助理 👋\n\n你可以私訊我：\n⏰ 建立提醒：「提醒我明天下午3點交報告」\n📋 查看提醒：「查看提醒」\n❓ 問問題：「上次會議結論？」\n📖 使用教學：「help」`);
  }
}

// ===== Admin 建案多輪對話 =====
// AI 分析完合約後，如果有不清楚的欄位，會跟 admin 互動詢問
async function handleProjectConversation(userReply, lineUserId, systemUserId, replyToken, stateJson) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    await sendReply(replyToken, '❌ AI 功能未啟用');
    return;
  }

  try {
    const state = JSON.parse(stateJson);
    const { analysis, conversation = [], extraction_id } = state;

    // 把使用者回答加入對話歷史
    conversation.push({ role: 'user', content: userReply });

    // 取得公司人員列表（供 AI 知道有哪些業務可指派）
    const { data: users } = await supabase
      .from('users')
      .select('id, name, role')
      .order('name');
    const userList = (users || []).map(u => `${u.name} (${u.role})`).join(', ');

    // 請 Claude 根據對話更新分析結果 + 決定下一步
    const systemPrompt = `你是川輝AI助理，正在協助管理員從合約建立專案。

## 目前 AI 抽取的資料
${JSON.stringify(analysis, null, 2)}

## 公司人員
${userList}

## 你的任務
1. 根據管理員的回覆，更新分析資料中不正確或不完整的欄位
2. 檢查是否還有必要欄位缺漏或不確定
3. 決定下一步：繼續追問 or 準備好建案

## 必要欄位（必須有值才能建案）
- client_name（客戶名稱）
- project_name（專案名稱）
- amount（合約金額，數字）

## 重要欄位（建議補齊）
- assigned_to_name（負責業務，從公司人員中選）
- commission_rate（分潤比例，預設 0.25 = 25%）
- payment_schedules（付款期程）

## 回傳格式（只回傳 JSON）
{
  "updated_analysis": { ... 更新後的完整分析資料 },
  "status": "asking" | "ready",
  "question": "要追問的問題（status=asking 時必填）",
  "summary": "已更新的內容摘要（一句話）"
}

- status = "asking"：還有欄位需要確認，question 裡放你的問題
- status = "ready"：所有必要資訊已齊全，可以建案

## 追問原則
- 一次只問一個問題，不要一次問一堆
- 問法要口語化，像在 LINE 聊天
- 如果管理員的回答可以推斷出答案，就直接更新不用再問
- 金額如果管理員說「150萬」，轉成 1500000
- 業務名字模糊配對公司人員列表
- 不要限制追問輪數，每一輪都重新判斷資料是否足夠
- 如果 client_name + project_name + amount 三個必要欄位都有了，就可以進入 ready 狀態
- 其他欄位（業務、分潤、付款期程等）有最好，沒有用預設值也行
- 如果使用者的回答含糊或答非所問，耐心再問一次，換個方式問
- 如果使用者說「就這樣」「先這樣」「其他用預設」，直接進入 ready 狀態
- 如果使用者連續回答都無法解析，建議他「要不要到系統網頁版操作？」但不要自動放棄`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: conversation
      })
    });

    if (!aiResponse.ok) throw new Error('AI 回應失敗');

    const aiData = await aiResponse.json();
    const aiText = aiData.content[0].text;
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error('AI 回傳格式異常');

    const result = JSON.parse(jsonMatch[0]);

    // 更新對話歷史
    conversation.push({ role: 'assistant', content: aiText });

    if (result.status === 'asking') {
      // 還需要追問 → 更新暫存，回覆問題
      const updatedState = {
        extraction_id,
        analysis: result.updated_analysis || analysis,
        conversation
      };

      await supabase.from('system_settings').upsert({
        key: `pending_extraction_${lineUserId}`,
        value: JSON.stringify(updatedState),
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

      let replyMsg = '';
      if (result.summary) replyMsg += `✅ ${result.summary}\n\n`;
      replyMsg += `❓ ${result.question}`;

      await sendReply(replyToken, replyMsg);

    } else if (result.status === 'ready') {
      // 資料齊全 → 顯示最終確認
      const final = result.updated_analysis || analysis;

      // 更新暫存為最終版本
      const updatedState = {
        extraction_id,
        analysis: final,
        conversation
      };

      await supabase.from('system_settings').upsert({
        key: `pending_extraction_${lineUserId}`,
        value: JSON.stringify(updatedState),
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

      // 顯示最終確認摘要
      const amt = final.amount ? `NT$ ${Number(final.amount).toLocaleString()}` : '未設定';
      const payCount = final.payment_schedules?.length || 0;
      const msCount = final.milestones?.length || 0;

      let confirmMsg = `✅ ${result.summary || '資料已補齊'}\n\n`;
      confirmMsg += `📋 最終建案資料：\n`;
      confirmMsg += `━━━━━━━━━━━━━━\n`;
      confirmMsg += `📌 客戶：${final.client_name || '未設定'}\n`;
      confirmMsg += `📌 專案：${final.project_name || '未設定'}\n`;
      confirmMsg += `💰 金額：${amt}\n`;
      if (final.assigned_to_name) confirmMsg += `👤 業務：${final.assigned_to_name}\n`;
      if (final.commission_rate) confirmMsg += `💎 分潤：${(final.commission_rate * 100)}%\n`;
      if (payCount > 0) confirmMsg += `💳 付款：${payCount} 期\n`;
      if (msCount > 0) confirmMsg += `🎯 里程碑：${msCount} 個\n`;
      if (final.warranty?.warranty_days) confirmMsg += `🛡️ 保固：${final.warranty.warranty_days} 天\n`;
      confirmMsg += `━━━━━━━━━━━━━━\n`;
      confirmMsg += `\n回覆「確認」建案 / 回覆「取消」放棄`;

      await sendReply(replyToken, confirmMsg);
    }

  } catch (error) {
    console.error('建案對話處理失敗:', error);
    await sendReply(replyToken, `❌ 處理失敗：${error.message}\n\n回覆「取消」重新開始`);
  }
}

// ===== Admin 確認建案（從 LINE 上傳合約後）=====
async function handleConfirmProjectCreation(lineUserId, systemUserId, replyToken) {
  try {
    // 1. 讀取暫存的分析結果
    const { data: pending } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', `pending_extraction_${lineUserId}`)
      .single();

    if (!pending?.value) {
      await sendReply(replyToken, '目前沒有待確認的建案。\n請先傳一份合約或提案書給我。');
      return;
    }

    const { extraction_id, analysis } = JSON.parse(pending.value);

    await sendReply(replyToken, '⏳ 正在建案中⋯⋯');

    // 2. 建立專案
    const projectCode = `P-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert([{
        client_name: analysis.client_name || '未命名客戶',
        project_name: analysis.project_name || '未命名專案',
        project_code: projectCode,
        amount: analysis.amount || 0,
        project_type: 'new',
        status: 'active',
        sign_date: analysis.signed_date || new Date().toISOString().split('T')[0],
        assigned_to: systemUserId
      }])
      .select()
      .single();

    if (projectError) throw new Error(`建立專案失敗: ${projectError.message}`);

    const projectId = project.id;
    const results = ['✅ 專案已建立'];

    // 3. 建立合約記錄
    try {
      await supabase.from('contracts').insert([{
        project_id: projectId,
        client_name: analysis.client_name,
        contract_amount: analysis.amount,
        tax_rate: analysis.tax_rate || 0.05,
        is_tax_included: analysis.is_tax_included !== false,
        signed_date: analysis.signed_date,
        contact_person: analysis.contact_person
      }]);
      results.push('✅ 合約記錄已建立');
    } catch (e) { results.push('⚠️ 合約記錄建立失敗'); }

    // 4. 建立付款期程
    if (analysis.payment_schedules?.length > 0) {
      try {
        const totalAmount = analysis.amount || 0;
        const taxRate = analysis.tax_rate || 0.05;

        const schedules = analysis.payment_schedules.map(ps => ({
          project_id: projectId,
          sequence_no: ps.sequence_no,
          payment_label: ps.label,
          percentage: ps.percentage,
          gross_amount: Math.round(totalAmount * ps.percentage / 100),
          net_amount: Math.round(totalAmount * ps.percentage / 100 / (1 + taxRate)),
          trigger_type: 'milestone',
          trigger_description: ps.trigger_description,
          status: 'pending'
        }));

        await supabase.from('project_payment_schedules').insert(schedules);
        results.push(`✅ 付款期程 ${schedules.length} 期已建立`);
      } catch (e) { results.push('⚠️ 付款期程建立失敗'); }
    }

    // 5. 建立里程碑
    if (analysis.milestones?.length > 0) {
      try {
        const milestones = analysis.milestones.map(m => ({
          project_id: projectId,
          title: m.title,
          acceptance_criteria: m.acceptance_criteria,
          sequence_order: m.sequence_order,
          status: 'pending'
        }));

        await supabase.from('project_milestones').insert(milestones);
        results.push(`✅ 里程碑 ${milestones.length} 個已建立`);
      } catch (e) { results.push('⚠️ 里程碑建立失敗'); }
    }

    // 6. 建立保固
    if (analysis.warranty?.warranty_days) {
      try {
        await supabase.from('project_warranties').insert([{
          project_id: projectId,
          warranty_days: analysis.warranty.warranty_days,
          start_trigger: analysis.warranty.start_trigger || 'acceptance',
          scope: analysis.warranty.scope,
          status: 'pending'
        }]);
        results.push(`✅ 保固 ${analysis.warranty.warranty_days} 天已建立`);
      } catch (e) { results.push('⚠️ 保固建立失敗'); }
    }

    // 7. 建立維護計畫
    if (analysis.maintenance?.enabled) {
      try {
        await supabase.from('project_maintenance_plans').insert([{
          project_id: projectId,
          enabled: true,
          monthly_fee: analysis.maintenance.monthly_fee || 0,
          start_rule: 'warranty_end',
          billing_cycle: 'monthly',
          status: 'pending'
        }]);
        results.push(`✅ 維護計畫已建立（月費 NT$ ${(analysis.maintenance.monthly_fee || 0).toLocaleString()}）`);
      } catch (e) { results.push('⚠️ 維護計畫建立失敗'); }
    }

    // 8. 建立分潤規則（預設 25%）
    try {
      await supabase.from('commission_rules').insert([{
        project_id: projectId,
        user_id: systemUserId,
        commission_rate: 0.25,
        basis_type: 'net_received',
        tax_rate_for_deduction: 0.05
      }]);
      results.push('✅ 分潤規則已建立（25%）');
    } catch (e) { results.push('⚠️ 分潤規則建立失敗'); }

    // 9. 更新 extraction 狀態
    if (extraction_id) {
      await supabase.from('contract_extraction_results')
        .update({ status: 'confirmed', reviewed_by: systemUserId, reviewed_at: new Date().toISOString() })
        .eq('id', extraction_id);
    }

    // 10. 清除暫存
    await supabase.from('system_settings').delete().eq('key', `pending_extraction_${lineUserId}`);

    // 11. 回覆結果
    let msg = `🎉 建案完成！\n\n`;
    msg += `📌 ${analysis.client_name} — ${analysis.project_name}\n`;
    msg += `📋 專案代號：${projectCode}\n`;
    msg += `💰 金額：NT$ ${(analysis.amount || 0).toLocaleString()}\n\n`;
    msg += results.join('\n');
    msg += `\n\n可在系統內查看：/projects/${projectId}`;

    await pushPrivateMessage(lineUserId, msg);

    // 12. 稽核紀錄
    try {
      const { logAssistantAction } = await import('../../../utils/assistantLogger.js');
      await logAssistantAction({
        actorUserId: systemUserId,
        channel: 'line_private',
        commandType: 'smart_project_creation',
        rawInput: '(檔案上傳 → 確認建案)',
        parsedIntent: analysis,
        resultStatus: 'success',
        resultData: { project_id: projectId, project_code: projectCode }
      });
    } catch (e) {}

  } catch (error) {
    console.error('確認建案失敗:', error);
    await pushPrivateMessage(lineUserId, `❌ 建案失敗：${error.message}\n\n請到系統網頁版重試。`);
  }
}

// 私訊推送（用 push message API）
async function pushPrivateMessage(userId, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !userId) return;
  try {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: text.substring(0, 5000) }]
      })
    });
  } catch (e) {
    console.error('私訊推送失敗:', e.message);
  }
}

// ===== Admin 傳檔案 → 智能建案 =====
// 收到 PDF/Word/圖片 → 解析 → 抽取合約資訊 → 回覆確認 → 等 admin 說「確認」後建案
async function handleAdminFileUpload(message, lineUserId, systemUserId, replyToken) {
  await sendReply(replyToken, '📄 收到檔案，正在 AI 分析中⋯⋯請稍候');

  try {
    // 1. 從 LINE 下載檔案
    if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error('缺少 LINE_CHANNEL_ACCESS_TOKEN');

    const downloadUrl = `https://api-data.line.me/v2/bot/message/${message.id}/content`;
    const fileResponse = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
    });

    if (!fileResponse.ok) throw new Error(`LINE 檔案下載失敗: ${fileResponse.status}`);

    const contentType = fileResponse.headers.get('content-type') || '';
    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const fileName = message.fileName || `file_${message.id}`;

    console.log(`📥 Admin 上傳檔案: ${fileName} (${contentType}, ${buffer.byteLength} bytes)`);

    // 2. 用 documentParser 解析
    const { parseDocument } = await import('../../../utils/documentParser.js');
    const parseResult = await parseDocument(buffer, fileName, contentType);

    if (!parseResult.success || parseResult.content_text.length < 50) {
      await pushPrivateMessage(lineUserId, `❌ 無法從檔案中提取有效內容\n\n可能原因：\n• 檔案是空白的\n• 格式不支援\n• 掃描品質太差\n\n支援格式：PDF、Word、JPG/PNG 圖片`);
      return;
    }

    console.log(`📝 解析完成: ${parseResult.content_text.length} 字 (方法: ${parseResult.metadata.parseMethod})`);

    // 3. 用 Claude 分析合約內容（同 analyze-proposal.js 的邏輯）
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) throw new Error('缺少 ANTHROPIC_API_KEY');

    const analysisPrompt = `你是專業文件分析助手。從以下合約/提案書中提取專案資訊，回傳 JSON：

{
  "client_name": "客戶名稱",
  "project_name": "專案名稱",
  "amount": 數字,
  "currency": "TWD",
  "tax_rate": 0.05,
  "is_tax_included": true,
  "payment_schedules": [{"sequence_no": 1, "label": "簽約款", "percentage": 30, "trigger_description": "合約簽訂後"}],
  "milestones": [{"title": "需求確認", "acceptance_criteria": "客戶簽核", "sequence_order": 1}],
  "warranty": {"warranty_days": 30, "start_trigger": "acceptance", "scope": "功能缺陷修復"},
  "maintenance": {"enabled": false, "monthly_fee": 0},
  "scope_summary": "專案範圍簡述",
  "signed_date": "YYYY-MM-DD 或 null",
  "contact_person": "聯絡人 或 null",
  "confidence": "high/medium/low"
}

注意：金額轉數字（50萬=500000），找不到的填 null，只回傳 JSON。

文件內容：
${parseResult.content_text.substring(0, 20000)}`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: analysisPrompt }]
      })
    });

    if (!aiResponse.ok) throw new Error('AI 分析失敗');

    const aiData = await aiResponse.json();
    const aiText = aiData.content[0].text;
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error('AI 回傳格式異常');

    const analysis = JSON.parse(jsonMatch[0]);

    // 4. 存入 contract_extraction_results 暫存
    const { data: extraction, error: saveError } = await supabase
      .from('contract_extraction_results')
      .insert([{
        raw_extraction: analysis,
        normalized_data: analysis,
        confidence_scores: { overall: analysis.confidence === 'high' ? 0.9 : analysis.confidence === 'medium' ? 0.7 : 0.5 },
        status: 'pending'
      }])
      .select()
      .single();

    if (saveError) console.error('儲存抽取結果失敗:', saveError);

    // 5. 檢查哪些欄位缺漏或低信心 → 決定要追問還是直接確認
    const missing = [];
    if (!analysis.client_name) missing.push('客戶名稱');
    if (!analysis.project_name) missing.push('專案名稱');
    if (!analysis.amount) missing.push('合約金額');
    if (!analysis.payment_schedules?.length) missing.push('付款期程');

    // 存入暫存（帶空的 conversation 開始多輪對話）
    const stateData = {
      extraction_id: extraction?.id,
      analysis,
      conversation: [] // 對話歷史
    };

    await supabase.from('system_settings').upsert({
      key: `pending_extraction_${lineUserId}`,
      value: JSON.stringify(stateData),
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

    if (missing.length > 0 || analysis.confidence === 'low') {
      // 有缺漏 → 開始追問
      const amt = analysis.amount ? `NT$ ${Number(analysis.amount).toLocaleString()}` : '❓ 未偵測到';

      let msg = `📋 合約分析完成，但有些資訊需要你確認：\n\n`;
      msg += `📌 客戶：${analysis.client_name || '❓'}\n`;
      msg += `📌 專案：${analysis.project_name || '❓'}\n`;
      msg += `💰 金額：${amt}\n`;
      msg += `🔍 信心度：${analysis.confidence || 'medium'}\n\n`;

      // 問第一個缺漏
      if (!analysis.client_name) {
        msg += `❓ 請問這份合約的客戶名稱是？`;
      } else if (!analysis.amount) {
        msg += `❓ 合約金額是多少？（含稅或未稅都可以，請註明）`;
      } else if (!analysis.project_name) {
        msg += `❓ 這個專案要叫什麼名稱？`;
      } else {
        msg += `❓ 這案子要指定給哪位業務負責？\n（或回覆「確認」直接用目前資料建案）`;
      }

      msg += `\n\n💡 隨時可回覆「取消」放棄建案`;

      await pushPrivateMessage(lineUserId, msg);
    } else {
      // 資料齊全 → 顯示完整結果，等確認
      const amt = `NT$ ${Number(analysis.amount).toLocaleString()}`;
      const payCount = analysis.payment_schedules?.length || 0;
      const msCount = analysis.milestones?.length || 0;

      let msg = `📋 合約分析完成！資料看起來齊全：\n\n`;
      msg += `📌 客戶：${analysis.client_name}\n`;
      msg += `📌 專案：${analysis.project_name}\n`;
      msg += `💰 金額：${amt}\n`;
      if (analysis.signed_date) msg += `📅 簽約日：${analysis.signed_date}\n`;
      if (payCount > 0) msg += `💳 付款：${payCount} 期\n`;
      if (msCount > 0) msg += `🎯 里程碑：${msCount} 個\n`;
      if (analysis.warranty?.warranty_days) msg += `🛡️ 保固：${analysis.warranty.warranty_days} 天\n`;
      if (analysis.maintenance?.enabled) msg += `🔧 維護：月費 NT$ ${(analysis.maintenance.monthly_fee || 0).toLocaleString()}\n`;

      msg += `\n有什麼要修改的嗎？\n`;
      msg += `• 直接告訴我要改什麼（例如「金額改成 200 萬」「業務指定 Andy」）\n`;
      msg += `• 或回覆「確認」直接建案\n`;
      msg += `• 回覆「取消」放棄`;

      await pushPrivateMessage(lineUserId, msg);
    }

  } catch (error) {
    console.error('Admin 檔案處理失敗:', error);
    await pushPrivateMessage(lineUserId, `❌ 檔案分析失敗：${error.message}`);
  }
}

// ===== Admin AI Agent — LINE 私訊版 =====
// 等同網頁版 AI Chat，支援查詢 + 操作 + 自然語言
async function handleAdminAgentMessage(text, lineUserId, systemUserId, replyToken) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    await sendReply(replyToken, '❌ AI 功能未啟用（缺少 API Key）');
    return;
  }

  try {
    // 收集系統資料作為上下文（admin 看全部）
    let contextData = '';

    // 根據訊息關鍵字動態載入
    if (/收款|付款|帳款|請款/.test(text)) {
      const { data } = await supabase.from('project_installments')
        .select('*, project:project_id(client_name, project_name, project_code)')
        .order('payment_date', { ascending: false }).limit(15);
      if (data?.length) contextData += '\n\n## 近期付款\n' + JSON.stringify(data, null, 2);
    }

    if (/分潤|佣金|獎金/.test(text)) {
      const { data } = await supabase.from('commissions')
        .select('*, project:project_id(client_name, project_name), user:user_id(name)')
        .order('created_at', { ascending: false }).limit(15);
      if (data?.length) contextData += '\n\n## 分潤資料\n' + JSON.stringify(data, null, 2);
    }

    if (/專案|案件|客戶|案子/.test(text)) {
      const { data } = await supabase.from('projects')
        .select('id, client_name, project_name, project_code, amount, status, assigned_to')
        .order('created_at', { ascending: false }).limit(15);
      if (data?.length) contextData += '\n\n## 專案列表\n' + JSON.stringify(data, null, 2);
    }

    if (/群組|LINE|line/.test(text)) {
      const { data } = await supabase.from('line_groups')
        .select('group_id, group_name, group_type, prospect_id, project_id, is_active')
        .eq('is_active', true).order('last_message_at', { ascending: false }).limit(15);
      if (data?.length) contextData += '\n\n## LINE 群組\n' + JSON.stringify(data, null, 2);
    }

    if (/業務|員工|用戶|團隊|誰/.test(text)) {
      const { data } = await supabase.from('users')
        .select('id, name, email, role, line_user_id').order('name');
      if (data?.length) contextData += '\n\n## 公司人員\n' + JSON.stringify(data, null, 2);
    }

    if (/洽談|商機|prospect/.test(text)) {
      const { data } = await supabase.from('prospects')
        .select('id, client_name, project_name, estimated_amount, stage, owner_id')
        .order('updated_at', { ascending: false }).limit(15);
      if (data?.length) contextData += '\n\n## 洽談商機\n' + JSON.stringify(data, null, 2);
    }

    if (/統計|總覽|多少|幾個/.test(text)) {
      const { count: pc } = await supabase.from('projects').select('*', { count: 'exact', head: true });
      const { count: prc } = await supabase.from('prospects').select('*', { count: 'exact', head: true });
      const { data: pays } = await supabase.from('project_installments').select('actual_amount').eq('status', 'paid').not('actual_amount', 'is', null);
      const total = (pays || []).reduce((s, p) => s + (p.actual_amount || 0), 0);
      contextData += `\n\n## 全公司統計\n- 專案: ${pc || 0}\n- 商機: ${prc || 0}\n- 總收款: NT$ ${total.toLocaleString()}`;
    }

    const today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

    const systemPrompt = `你是「川輝AI助理」，正在與公司管理員私訊對話。你有完整的系統操作權限。

## 當前資訊
- 今天：${today}
- 身份：管理員（最高權限）

## 你可以執行的操作
當管理員要求時，在回應中加入 \`\`\`action 區塊：

可執行：
- create_project: 建立專案 (client_name, project_name, amount)
- create_prospect: 建立商機 (client_name, project_name, estimated_amount)
- update_project_status: 更新專案狀態 (project_id, status)
- update_milestone_status: 更新里程碑 (milestone_id, status)
- generate_proposal: 產生提案書 (client_name, project_name, requirements)

格式：
\`\`\`action
{"action": "create_project", "params": {"client_name": "ABC", "project_name": "官網", "amount": 350000}}
\`\`\`

## 操作規則
1. 建立/修改前先列出要做的事讓管理員確認
2. 管理員說「好」「確認」「OK」「做」才執行
3. 查詢直接回答
4. 資訊不完整先追問
5. 回答簡潔（LINE 訊息不宜太長）

## 系統資料
${contextData || '（未偵測到相關資料，請直接回答）'}`;

    // 呼叫 Claude（非串流，LINE 不支援 SSE）
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }]
      })
    });

    if (!response.ok) {
      await sendReply(replyToken, '❌ AI 回應失敗，請稍後再試');
      return;
    }

    const data = await response.json();
    let aiResponse = data.content[0].text;

    // 檢查是否有 action 區塊要執行
    const actionMatch = aiResponse.match(/```action\s*\n([\s\S]*?)\n```/);
    if (actionMatch) {
      try {
        const actionData = JSON.parse(actionMatch[1]);
        const { executeOperation, logCommand } = await import('../../../utils/agentExecutor.js');
        const result = await executeOperation(actionData.action, actionData.params, systemUserId);

        // 記錄操作
        await logCommand({
          actorUserId: systemUserId,
          channel: 'line_private',
          commandType: actionData.action,
          rawInput: text,
          parsedIntent: actionData,
          resultStatus: result.success ? 'success' : 'failed',
          resultData: result.data,
          errorMessage: result.error
        });

        // 加上操作結果
        const cleanResponse = aiResponse.replace(/```action[\s\S]*?```/, '').trim();
        if (result.success) {
          aiResponse = cleanResponse + `\n\n✅ 操作成功！${result.data?.message || ''}`;
        } else {
          aiResponse = cleanResponse + `\n\n❌ 操作失敗：${result.error}`;
        }
      } catch (e) {
        console.error('LINE Agent 操作執行失敗:', e);
      }
    }

    // LINE 訊息上限 5000 字
    await sendReply(replyToken, aiResponse.substring(0, 5000));

  } catch (error) {
    console.error('Admin Agent 處理失敗:', error);
    await sendReply(replyToken, `❌ 處理失敗：${error.message}`);
  }
}

// 查詢使用者顯示名稱
async function getUserDisplayName(lineUserId) {
  if (!lineUserId) return '未知';
  const { data: identity } = await supabase
    .from('contact_identities')
    .select('real_name, display_name')
    .eq('line_user_id', lineUserId)
    .single();
  if (identity) return identity.real_name || identity.display_name;

  const { data: user } = await supabase
    .from('users')
    .select('name')
    .eq('line_user_id', lineUserId)
    .single();
  return user?.name || '未知';
}

// 簡單回覆（用 replyToken）
async function sendReply(replyToken, text) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !replyToken) return;
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
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
  } catch (e) {
    console.error('回覆失敗:', e.message);
  }
}

// ===== AI 解析結果轉合成指令 =====

// 把 AI 解析的建立會議參數轉成 handleMeetingCommand 能接受的格式
function buildSyntheticCommand(params) {
  let cmd = '/建立會議';
  if (params.startTime) {
    const d = new Date(params.startTime);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    cmd += ` ${month}/${day} ${hours}:${minutes}`;

    if (params.endTime) {
      const e = new Date(params.endTime);
      cmd += `~${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
    }
  }
  if (params.participants?.length > 0) {
    cmd += ' ' + params.participants.map(p => p.name || p).join(' ');
  } else {
    cmd += ' 所有人';
  }
  if (params.title) {
    cmd = `/建立會議 ${params.title} ` + cmd.replace('/建立會議 ', '');
  }
  return cmd;
}

// 把 AI 解析的修改會議參數轉成 handleModifyMeetingCommand 能接受的格式
function buildModifyCommand(params) {
  const keyword = params.keyword || '會議';

  if (params.changes?.start_time) {
    const d = new Date(params.changes.start_time);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    let timeStr = `${month}/${day} ${hours}:${minutes}`;
    if (params.changes.end_time) {
      const e = new Date(params.changes.end_time);
      timeStr += `~${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`;
    }
    return `/修改會議 ${keyword} 改時間 ${timeStr}`;
  }
  if (params.changes?.title) {
    return `/修改會議 ${keyword} 改標題 ${params.changes.title}`;
  }
  if (params.changes?.time_shift_minutes) {
    // time_shift 需要查到原始會議時間才能算，先用簡單描述
    const shift = params.changes.time_shift_minutes;
    const desc = shift > 0 ? `延後${shift}分鐘` : `提前${Math.abs(shift)}分鐘`;
    return `/修改會議 ${keyword} 改時間 ${desc}`;
  }

  return `/修改會議 ${keyword}`;
}

// 把 AI 解析的取消會議參數轉成 handleCancelMeetingCommand 能接受的格式
function buildCancelCommand(params) {
  const keyword = params.keyword || '會議';
  let cmd = `/取消會議 ${keyword}`;
  if (params.cancelReason) {
    cmd += ` 原因：${params.cancelReason}`;
  }
  return cmd;
}

// 從 MIME type 取得副檔名
function getExtensionFromMimeType(mimeType, messageType) {
  const mimeToExt = {
    // 圖片
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    // 影片
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    // 音訊
    'audio/m4a': '.m4a',
    'audio/mp3': '.mp3',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    // 文件
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/msword': '.doc',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.ms-powerpoint': '.ppt',
    // 壓縮檔
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/x-7z-compressed': '.7z',
    'application/gzip': '.gz',
    // 其他
    'text/plain': '.txt',
    'application/json': '.json',
    'application/xml': '.xml'
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

  // Update stored_files with uploader identity
  try {
    const { data: identity } = await supabase
      .from('contact_identities')
      .select('id')
      .eq('line_user_id', messageData.sender_id)
      .single();

    if (identity) {
      await supabase
        .from('stored_files')
        .update({
          uploaded_by_identity_id: identity.id,
          project_id: group?.project_id || null
        })
        .eq('source_message_id', messageData.message_id?.toString());
    }
  } catch (e) {
    // Non-critical
  }
}

// 判斷檔案類型
function getFileType(fileName, messageType) {
  if (!fileName) {
    return messageType; // image, video, audio
  }

  const ext = fileName.split('.').pop()?.toLowerCase();
  const extToType = {
    // 文件
    'pdf': 'pdf',
    'doc': 'word',
    'docx': 'word',
    'xls': 'excel',
    'xlsx': 'excel',
    'ppt': 'powerpoint',
    'pptx': 'powerpoint',
    // 圖片
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'gif': 'image',
    'webp': 'image',
    'bmp': 'image',
    // 影片
    'mp4': 'video',
    'mov': 'video',
    'avi': 'video',
    // 音訊
    'mp3': 'audio',
    'm4a': 'audio',
    'wav': 'audio',
    // 壓縮檔
    'zip': 'archive',
    'rar': 'archive',
    '7z': 'archive',
    'gz': 'archive',
    // 其他
    'txt': 'text',
    'json': 'text',
    'xml': 'text'
  };

  return extToType[ext] || 'other';
}
