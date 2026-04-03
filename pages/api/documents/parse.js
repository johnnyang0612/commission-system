// 文件解析 API - 將 PDF/Word/圖片轉換為純文字（V2 增強版）
import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';
import { parseDocument } from '../../../utils/documentParser';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
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

    // 3. 使用文件解析引擎 V2 處理文件
    const fileBuffer = Buffer.from(await fileData.arrayBuffer());
    const fileName = doc.file_name || doc.document_name || 'document';
    const mimeType = doc.file_type || '';

    console.log(`[parse API] 開始解析文件: ${fileName}, 類型: ${mimeType}, 大小: ${fileBuffer.length} bytes`);

    const parseResult = await parseDocument(fileBuffer, fileName, mimeType);

    if (!parseResult.success) {
      return res.status(400).json({
        error: parseResult.error,
        supported: parseResult.supported,
        parse_method: parseResult.metadata?.parseMethod,
        hint: parseResult.metadata?.parseMethod?.includes('vision')
          ? 'Vision OCR 未能提取足夠文字，請確認文件內容清晰'
          : '請確認文件不是空白文件'
      });
    }

    // 4. 回傳結果
    return res.status(200).json({
      success: true,
      document_id: doc.id,
      document_name: doc.document_name,
      document_type: doc.document_type,
      project_id: doc.project_id,
      client_name: doc.projects?.client_name || '',
      content_length: parseResult.content_text.length,
      content_preview: parseResult.content_text.substring(0, 500) + '...',
      content_text: parseResult.content_text,
      parse_method: parseResult.metadata.parseMethod,
      chunk_count: parseResult.metadata.chunkCount,
      page_count: parseResult.metadata.pageCount
    });

  } catch (error) {
    console.error('文件解析錯誤:', error);
    return res.status(500).json({
      error: '文件解析失敗',
      details: error.message
    });
  }
}
