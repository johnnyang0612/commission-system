// 文件處理整合 API - 解析 + 向量化一次完成
import { supabase } from '../../../utils/supabaseClient';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_CHUNK_SIZE = 8000;

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { document_id } = req.body;

  if (!document_id) {
    return res.status(400).json({ error: 'document_id is required' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: '缺少 OpenAI API Key',
      hint: '請在 .env.local 中設定 OPENAI_API_KEY'
    });
  }

  try {
    // ===== STEP 1: 取得文件資訊 =====
    const { data: doc, error: docError } = await supabase
      .from('project_documents')
      .select('*, projects(client_name)')
      .eq('id', document_id)
      .single();

    if (docError || !doc) {
      return res.status(404).json({ error: '找不到文件' });
    }

    // ===== STEP 2: 下載文件 =====
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(doc.bucket_name || 'documents')
      .download(doc.file_path);

    if (downloadError) {
      return res.status(500).json({ error: '下載文件失敗', details: downloadError.message });
    }

    // ===== STEP 3: 解析文件 =====
    let extractedText = '';
    const fileType = doc.file_type?.toLowerCase() || '';
    const fileName = doc.file_name?.toLowerCase() || '';

    if (fileType.includes('pdf') || fileName.endsWith('.pdf')) {
      extractedText = await parsePDF(fileData);
    } else if (
      fileType.includes('word') ||
      fileType.includes('document') ||
      fileName.endsWith('.docx')
    ) {
      extractedText = await parseWord(fileData);
    } else if (fileType.includes('text') || fileName.endsWith('.txt')) {
      extractedText = await fileData.text();
    } else {
      return res.status(400).json({
        error: '不支援的文件格式',
        supported: ['PDF', 'Word (.docx)', 'Text (.txt)']
      });
    }

    extractedText = cleanText(extractedText);

    if (!extractedText || extractedText.length < 10) {
      return res.status(400).json({ error: '無法從文件中提取有效內容' });
    }

    // ===== STEP 4: 分割並向量化 =====
    const chunks = splitIntoChunks(extractedText, MAX_CHUNK_SIZE);

    // 刪除舊的 embeddings
    await supabase
      .from('document_embeddings')
      .delete()
      .eq('document_id', document_id);

    // 產生新的 embeddings
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk);

      const { data, error } = await supabase
        .from('document_embeddings')
        .insert({
          document_id: doc.id,
          project_id: doc.project_id,
          content_text: chunk,
          chunk_index: i,
          chunk_total: chunks.length,
          embedding: JSON.stringify(embedding),
          document_type: doc.document_type,
          document_name: doc.document_name,
          client_name: doc.projects?.client_name || ''
        })
        .select('id')
        .single();

      if (error) throw error;

      results.push({ chunk_index: i, embedding_id: data.id });
    }

    // ===== STEP 5: 回傳結果 =====
    return res.status(200).json({
      success: true,
      document_id: doc.id,
      document_name: doc.document_name,
      document_type: doc.document_type,
      content_length: extractedText.length,
      chunks_processed: chunks.length,
      message: `成功處理文件，共 ${chunks.length} 個區塊`
    });

  } catch (error) {
    console.error('文件處理錯誤:', error);
    return res.status(500).json({ error: '處理失敗', details: error.message });
  }
}

// ===== 工具函數 =====

async function parsePDF(fileBlob) {
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseWord(fileBlob) {
  const mammoth = await import('mammoth');
  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitIntoChunks(text, maxSize) {
  if (text.length <= maxSize) return [text];

  const chunks = [];
  const sentences = text.split(/(?<=[。！？.!?\n])/);
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxSize) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

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
