// 測試 Supabase 連線
import { supabase } from '../../utils/supabaseClient';

export default async function handler(req, res) {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    supabaseExists: !!supabase,
    envVars: {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?
        `${process.env.NEXT_PUBLIC_SUPABASE_URL.substring(0, 30)}...` : 'missing'
    }
  };

  if (!supabase) {
    return res.status(500).json({
      ...diagnostics,
      error: 'Supabase client 未初始化',
      suggestion: '檢查環境變數是否正確設定'
    });
  }

  try {
    // 測試 1: 列出所有 buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    diagnostics.listBucketsResult = {
      success: !listError,
      error: listError ? {
        message: listError.message,
        statusCode: listError.statusCode,
        hint: listError.hint
      } : null,
      bucketCount: buckets?.length || 0,
      bucketNames: buckets?.map(b => b.name) || []
    };

    // 測試 2: 檢查特定 bucket
    const chatFilesBucket = buckets?.find(b => b.name === 'chat-files');
    diagnostics.chatFilesBucket = chatFilesBucket ? {
      exists: true,
      id: chatFilesBucket.id,
      name: chatFilesBucket.name,
      public: chatFilesBucket.public,
      createdAt: chatFilesBucket.created_at
    } : {
      exists: false
    };

    // 測試 3: 嘗試簡單查詢
    const { data: testData, error: testError } = await supabase
      .from('line_messages')
      .select('id')
      .limit(1);

    diagnostics.databaseTest = {
      success: !testError,
      error: testError ? testError.message : null
    };

    return res.status(200).json(diagnostics);
  } catch (error) {
    return res.status(500).json({
      ...diagnostics,
      error: error.message,
      stack: error.stack
    });
  }
}
