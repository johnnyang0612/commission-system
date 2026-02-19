#!/usr/bin/env node
// 檔案回溯救援腳本
// 自動重試，直到所有 7 天內的檔案都救回來或確認已過期

const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('缺少 SUPABASE 環境變數');
  process.exit(1);
}
if (!LINE_TOKEN) {
  console.error('缺少 LINE_CHANNEL_ACCESS_TOKEN');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MAX_ROUNDS = 10;
const RETRY_DELAY_MS = 1000; // 每個檔案之間等 1 秒
const ROUND_DELAY_MS = 5000; // 每輪之間等 5 秒
const MAX_FILE_RETRIES = 3; // 單一檔案最多重試 3 次

// MIME type 對照表
const MIME_TO_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/bmp': '.bmp',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-msvideo': '.avi',
  'audio/m4a': '.m4a', 'audio/mp3': '.mp3', 'audio/mpeg': '.mp3', 'audio/wav': '.wav',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/msword': '.doc', 'application/vnd.ms-excel': '.xls',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/zip': '.zip', 'application/x-zip-compressed': '.zip',
  'application/x-rar-compressed': '.rar', 'application/x-7z-compressed': '.7z',
  'application/gzip': '.gz',
  'text/plain': '.txt', 'application/json': '.json', 'application/xml': '.xml'
};

function getExt(mimeType, msgType) {
  if (MIME_TO_EXT[mimeType]) return MIME_TO_EXT[mimeType];
  if (msgType === 'image') return '.jpg';
  if (msgType === 'video') return '.mp4';
  if (msgType === 'audio') return '.m4a';
  return '';
}

function getFileType(fileName, messageType) {
  if (!fileName) return messageType;
  const ext = fileName.split('.').pop().toLowerCase();
  const map = {
    pdf: 'pdf', doc: 'word', docx: 'word', xls: 'excel', xlsx: 'excel',
    ppt: 'powerpoint', pptx: 'powerpoint',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', bmp: 'image',
    mp4: 'video', mov: 'video', avi: 'video',
    mp3: 'audio', m4a: 'audio', wav: 'audio',
    zip: 'archive', rar: 'archive', '7z': 'archive', gz: 'archive',
    txt: 'text', json: 'text', xml: 'text'
  };
  return map[ext] || 'other';
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadAndUpload(msg) {
  const downloadUrl = `https://api-data.line.me/v2/bot/message/${msg.message_id}/content`;

  const response = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${LINE_TOKEN}` }
  });

  if (response.status === 404) {
    return { status: 'expired' };
  }
  if (!response.ok) {
    throw new Error(`LINE API HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  const buffer = await response.arrayBuffer();
  const ext = getExt(contentType, msg.message_type);
  const fileName = msg.file_name || `${msg.message_type}_${msg.message_id}${ext}`;
  // Storage 路徑用英文安全名稱
  const safeFileName = `${msg.message_type}_${msg.message_id}${ext}`;
  const storagePath = `chat/${msg.group_id}/${Date.now()}_${safeFileName}`;

  const { data, error } = await supabase.storage
    .from('chat-files')
    .upload(storagePath, Buffer.from(buffer), {
      contentType: contentType,
      upsert: false
    });

  if (error) {
    throw new Error(`Storage 上傳失敗: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('chat-files')
    .getPublicUrl(storagePath);

  return {
    status: 'success',
    fileName,
    fileSize: buffer.byteLength,
    publicUrl: urlData.publicUrl
  };
}

async function saveFileRecord(msg, fileInfo) {
  const { data: group } = await supabase
    .from('line_groups')
    .select('prospect_id, project_id')
    .eq('group_id', msg.group_id)
    .single();

  const { error } = await supabase
    .from('line_files')
    .insert([{
      message_id: msg.id,
      group_id: msg.group_id,
      prospect_id: group?.prospect_id,
      project_id: group?.project_id,
      file_name: fileInfo.fileName,
      file_type: getFileType(fileInfo.fileName, msg.message_type),
      file_size: fileInfo.fileSize,
      public_url: fileInfo.publicUrl,
      uploaded_by_name: msg.sender_name || '未知',
      uploaded_by_id: msg.sender_id
    }]);

  if (error) {
    console.error(`  ⚠️ line_files 寫入失敗 (不影響主記錄): ${error.message}`);
  }
}

async function runBackfill() {
  // 只撈 7 天內的
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: messages, error } = await supabase
    .from('line_messages')
    .select('*')
    .in('message_type', ['image', 'video', 'audio', 'file'])
    .is('file_url', null)
    .gte('timestamp', sevenDaysAgo.toISOString())
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('查詢失敗:', error.message);
    return { pending: 0, success: 0, failed: 0, expired: 0 };
  }

  console.log(`\n找到 ${messages.length} 則未儲存的檔案訊息 (7天內)`);

  if (messages.length === 0) {
    return { pending: 0, success: 0, failed: 0, expired: 0 };
  }

  const result = { pending: messages.length, success: 0, failed: 0, expired: 0 };

  for (const msg of messages) {
    const label = `${msg.message_type} | ${msg.file_name || msg.message_id} | ${msg.timestamp}`;
    let succeeded = false;

    for (let attempt = 1; attempt <= MAX_FILE_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`  🔄 重試 #${attempt}...`);
          await sleep(RETRY_DELAY_MS * attempt); // 遞增延遲
        }

        const info = await downloadAndUpload(msg);

        if (info.status === 'expired') {
          console.log(`  ⏰ 已過期: ${label}`);
          result.expired++;
          succeeded = true;
          break;
        }

        // 更新 line_messages
        const { error: updateError } = await supabase
          .from('line_messages')
          .update({
            file_name: info.fileName,
            file_size: info.fileSize,
            file_url: info.publicUrl
          })
          .eq('id', msg.id);

        if (updateError) {
          throw new Error(`DB 更新失敗: ${updateError.message}`);
        }

        // 寫入 line_files
        await saveFileRecord(msg, info);

        console.log(`  ✅ 成功: ${label} (${(info.fileSize / 1024).toFixed(0)} KB)`);
        result.success++;
        succeeded = true;
        break;
      } catch (err) {
        console.error(`  ❌ 嘗試 #${attempt} 失敗: ${err.message}`);
      }
    }

    if (!succeeded) {
      console.error(`  ❌ 放棄: ${label} (${MAX_FILE_RETRIES} 次都失敗)`);
      result.failed++;
    }

    await sleep(RETRY_DELAY_MS);
  }

  return result;
}

async function main() {
  console.log('========================================');
  console.log('LINE 檔案回溯救援');
  console.log('========================================');
  console.log(`時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);

  let round = 0;
  let totalSuccess = 0;
  let totalExpired = 0;

  while (round < MAX_ROUNDS) {
    round++;
    console.log(`\n--- 第 ${round} 輪 ---`);

    const result = await runBackfill();

    totalSuccess += result.success;
    totalExpired += result.expired;

    console.log(`\n第 ${round} 輪結果: 成功=${result.success} 過期=${result.expired} 失敗=${result.failed} 待處理=${result.pending}`);

    // 沒有待處理的了
    if (result.pending === 0) {
      console.log('\n✅ 已無待處理檔案，結束！');
      break;
    }

    // 沒有失敗的（全部成功或過期）
    if (result.failed === 0) {
      console.log('\n✅ 本輪全部處理完成，結束！');
      break;
    }

    // 還有失敗的，等一下再試
    console.log(`\n⏳ 還有 ${result.failed} 個失敗，${ROUND_DELAY_MS / 1000} 秒後重試...`);
    await sleep(ROUND_DELAY_MS);
  }

  console.log('\n========================================');
  console.log('最終結果');
  console.log(`  總共救回: ${totalSuccess} 個檔案`);
  console.log(`  已過期:   ${totalExpired} 個檔案`);
  console.log('========================================');
}

main().catch(err => {
  console.error('腳本執行失敗:', err);
  process.exit(1);
});
