// 文件解析 API - 將 PDF/Word 轉換為純文字
import { supabase } from '../../../utils/supabaseClient';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
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

  try {
    // 1. 從資料庫取得文件資訊
    const { data: doc, error: docError } = await supabase
      .from('project_documents')
      .select('*, projects(client_name)')
      .eq('id', document_id)
      .single();

    if (docError || !doc) {
      return res.status(404).json({ error: '找不到文件', details: docError?.message });
    }

    // 2. 從 Storage 下載文件
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(doc.bucket_name || 'documents')
      .download(doc.file_path);

    if (downloadError) {
      return res.status(500).json({ error: '下載文件失敗', details: downloadError.message });
    }

    // 3. 根據文件類型解析內容
    let extractedText = '';
    const fileType = doc.file_type?.toLowerCase() || '';
    const fileName = doc.file_name?.toLowerCase() || '';

    if (fileType.includes('pdf') || fileName.endsWith('.pdf')) {
      // 解析 PDF
      extractedText = await parsePDF(fileData);
    } else if (
      fileType.includes('word') ||
      fileType.includes('document') ||
      fileName.endsWith('.docx') ||
      fileName.endsWith('.doc')
    ) {
      // 解析 Word
      extractedText = await parseWord(fileData);
    } else if (fileType.includes('text') || fileName.endsWith('.txt')) {
      // 純文字
      extractedText = await fileData.text();
    } else {
      return res.status(400).json({
        error: '不支援的文件格式',
        supported: ['PDF', 'Word (.docx)', 'Text (.txt)'],
        received: fileType || fileName
      });
    }

    // 4. 清理文字
    extractedText = cleanText(extractedText);

    if (!extractedText || extractedText.length < 10) {
      return res.status(400).json({
        error: '無法從文件中提取有效內容',
        hint: '請確認文件不是掃描圖片或空白文件'
      });
    }

    // 5. 回傳結果
    return res.status(200).json({
      success: true,
      document_id: doc.id,
      document_name: doc.document_name,
      document_type: doc.document_type,
      project_id: doc.project_id,
      client_name: doc.projects?.client_name || '',
      content_length: extractedText.length,
      content_preview: extractedText.substring(0, 500) + '...',
      content_text: extractedText
    });

  } catch (error) {
    console.error('文件解析錯誤:', error);
    return res.status(500).json({
      error: '文件解析失敗',
      details: error.message
    });
  }
}

// PDF 解析
async function parsePDF(fileBlob) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('PDF 解析錯誤:', error);
    throw new Error('PDF 解析失敗: ' + error.message);
  }
}

// Word 解析
async function parseWord(fileBlob) {
  try {
    const mammoth = await import('mammoth');
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error('Word 解析錯誤:', error);
    throw new Error('Word 解析失敗: ' + error.message);
  }
}

// 清理文字
function cleanText(text) {
  if (!text) return '';

  return text
    // 移除多餘空白
    .replace(/\s+/g, ' ')
    // 移除特殊控制字元
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 保留換行但限制連續換行數量
    .replace(/\n{3,}/g, '\n\n')
    // 移除首尾空白
    .trim();
}
