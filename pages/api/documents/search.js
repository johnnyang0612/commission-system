// 相似文件搜尋 API - 根據查詢找出最相關的歷史文件
import { supabase } from '../../../utils/supabaseClient';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    query,              // 搜尋查詢文字
    document_type,      // 過濾文件類型 (proposal, specification, etc.)
    match_threshold = 0.5,  // 相似度門檻
    match_count = 5     // 返回數量
  } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: '缺少 OpenAI API Key',
      hint: '請在 .env.local 中設定 OPENAI_API_KEY'
    });
  }

  try {
    // 1. 將查詢文字轉換為向量
    const queryEmbedding = await getEmbedding(query);

    // 2. 使用 Supabase RPC 呼叫相似度搜尋函數
    const { data: results, error: searchError } = await supabase.rpc(
      'search_similar_documents',
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: match_threshold,
        match_count: match_count,
        filter_document_type: document_type || null
      }
    );

    if (searchError) {
      console.error('搜尋錯誤:', searchError);

      // 如果 RPC 函數不存在，使用手動查詢
      if (searchError.message.includes('function') || searchError.code === '42883') {
        console.log('RPC 函數不存在，使用手動查詢...');
        const manualResults = await manualSearch(queryEmbedding, document_type, match_threshold, match_count);
        return res.status(200).json({
          success: true,
          query,
          results: manualResults,
          count: manualResults.length,
          method: 'manual'
        });
      }

      throw searchError;
    }

    // 3. 獲取相關文件的完整資訊
    const enrichedResults = await Promise.all(
      (results || []).map(async (result) => {
        // 取得原始文件資訊
        const { data: docInfo } = await supabase
          .from('project_documents')
          .select('public_url, file_name, created_at, document_status')
          .eq('id', result.document_id)
          .single();

        return {
          ...result,
          public_url: docInfo?.public_url,
          file_name: docInfo?.file_name,
          created_at: docInfo?.created_at,
          document_status: docInfo?.document_status,
          similarity_percent: Math.round(result.similarity * 100)
        };
      })
    );

    return res.status(200).json({
      success: true,
      query,
      document_type_filter: document_type || 'all',
      results: enrichedResults,
      count: enrichedResults.length
    });

  } catch (error) {
    console.error('搜尋失敗:', error);
    return res.status(500).json({ error: '搜尋失敗', details: error.message });
  }
}

// 取得查詢的 embedding
async function getEmbedding(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: 1536
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'OpenAI API 錯誤');
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// 手動搜尋（備用方案）
async function manualSearch(queryEmbedding, documentType, threshold, limit) {
  // 取得所有 embeddings
  let query = supabase
    .from('document_embeddings')
    .select('*');

  if (documentType) {
    query = query.eq('document_type', documentType);
  }

  const { data: embeddings, error } = await query.limit(100);

  if (error || !embeddings) {
    return [];
  }

  // 計算餘弦相似度
  const results = embeddings
    .map(doc => {
      const embedding = typeof doc.embedding === 'string'
        ? JSON.parse(doc.embedding)
        : doc.embedding;
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      return { ...doc, similarity };
    })
    .filter(doc => doc.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return results;
}

// 餘弦相似度計算
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
