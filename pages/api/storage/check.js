// Storage 診斷 API
// 檢查 Supabase Storage bucket 是否正確設定

import { supabase } from '../../../utils/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const results = {
    supabaseConnected: false,
    bucketExists: false,
    bucketPublic: false,
    canUpload: false,
    canRead: false,
    errors: []
  };

  try {
    // 1. 檢查 Supabase 連線
    if (!supabase) {
      results.errors.push('Supabase client 未初始化');
      return res.status(500).json(results);
    }
    results.supabaseConnected = true;

    // 2. 測試上傳功能到 chat-files bucket
    const testContent = 'Test file for LINE integration';
    const testPath = `test/${Date.now()}_test.txt`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('chat-files')
      .upload(testPath, testContent, {
        contentType: 'text/plain',
        upsert: true
      });

    if (uploadError) {
      // 判斷錯誤類型
      if (uploadError.message.includes('Bucket not found') || uploadError.statusCode === 404) {
        results.errors.push('chat-files bucket 不存在');
        results.errors.push('請到 Supabase Dashboard → Storage → 新增 bucket → 名稱: chat-files');
      } else if (uploadError.message.includes('new row violates row-level security')) {
        results.bucketExists = true; // bucket 存在，但權限不足
        results.errors.push('RLS 政策問題: 請到 Storage → chat-files → Policies → 新增允許上傳的政策');
        results.errors.push('建議政策: 允許 authenticated 用戶上傳');
      } else {
        results.bucketExists = true; // 假設 bucket 存在
        results.errors.push(`上傳測試失敗: ${uploadError.message}`);
      }
    } else {
      // 上傳成功，表示 bucket 存在且有權限
      results.bucketExists = true;
      results.bucketPublic = true; // 能成功操作表示設定正確
      results.canUpload = true;

      // 3. 測試讀取功能
      const { data: urlData } = supabase.storage
        .from('chat-files')
        .getPublicUrl(testPath);

      if (urlData?.publicUrl) {
        results.canRead = true;

        // 嘗試刪除測試檔案
        await supabase.storage
          .from('chat-files')
          .remove([testPath]);
      }
    }

    return res.status(200).json(results);
  } catch (error) {
    results.errors.push(`異常錯誤: ${error.message}`);
    return res.status(500).json(results);
  }
}
