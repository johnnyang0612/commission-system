// 文件向量化 API - 將文字轉換為向量並儲存
import { supabase } from '../../../utils/supabaseClient';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small'; // 或 'text-embedding-ada-002'
const MAX_CHUNK_SIZE = 8000; // OpenAI embedding 的 token 限制約 8191

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: '缺少 OpenAI API Key',
      hint: '請在 .env.local 中設定 OPENAI_API_KEY'
    });
  }

  const { document_id, content_text, document_type, document_name, client_name, project_id } = req.body;

  if (!document_id || !content_text) {
    return res.status(400).json({
      error: '缺少必要參數',
      required: ['document_id', 'content_text']
    });
  }

  try {
    // 1. 將內容分割成 chunks（如果太長）
    const chunks = splitIntoChunks(content_text, MAX_CHUNK_SIZE);
    console.log(`文件 ${document_id} 分割為 ${chunks.length} 個區塊`);

    // 2. 先刪除舊的 embeddings（如果重新處理）
    await supabase
      .from('document_embeddings')
      .delete()
      .eq('document_id', document_id);

    // 3. 為每個 chunk 產生 embedding
    const embeddings = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // 呼叫 OpenAI Embedding API
      const embedding = await getEmbedding(chunk);

      if (!embedding) {
        throw new Error(`無法為區塊 ${i + 1} 產生 embedding`);
      }

      // 4. 儲存到資料庫
      const { data, error } = await supabase
        .from('document_embeddings')
        .insert({
          document_id,
          project_id,
          content_text: chunk,
          chunk_index: i,
          chunk_total: chunks.length,
          embedding: JSON.stringify(embedding), // pgvector 接受 JSON 格式
          document_type,
          document_name,
          client_name
        })
        .select('id')
        .single();

      if (error) {
        console.error('儲存 embedding 失敗:', error);
        throw error;
      }

      embeddings.push({
        chunk_index: i,
        embedding_id: data.id,
        content_preview: chunk.substring(0, 100) + '...'
      });
    }

    return res.status(200).json({
      success: true,
      document_id,
      chunks_processed: chunks.length,
      embeddings
    });

  } catch (error) {
    console.error('向量化錯誤:', error);
    return res.status(500).json({
      error: '向量化失敗',
      details: error.message
    });
  }
}

// 呼叫 OpenAI Embedding API
async function getEmbedding(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: 1536 // text-embedding-3-small 支援指定維度
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'OpenAI API 錯誤');
    }

    const data = await response.json();
    return data.data[0].embedding;

  } catch (error) {
    console.error('OpenAI Embedding 錯誤:', error);
    throw error;
  }
}

// 將文字分割成 chunks
function splitIntoChunks(text, maxSize) {
  if (text.length <= maxSize) {
    return [text];
  }

  const chunks = [];
  const sentences = text.split(/(?<=[。！？.!?\n])/); // 按句子分割

  let currentChunk = '';
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
