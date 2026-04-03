/**
 * 文件解析引擎 V2
 * 支援：PDF（含掃描版）、DOCX（含圖片）、圖片、大檔案分段
 *
 * 使用 Claude Vision API 處理掃描文件和圖片 OCR
 */

// 每段最大字元數（約 4000 tokens，安全範圍）
const MAX_CHUNK_SIZE = 12000;

// Claude Vision 每次請求最多處理的圖片數
const MAX_IMAGES_PER_REQUEST = 10;

// ============================================================
// 主要入口
// ============================================================

/**
 * 解析文件，支援 PDF、Word、圖片、純文字
 * @param {Buffer} fileBuffer - 文件 buffer
 * @param {string} fileName - 檔案名稱
 * @param {string} mimeType - MIME 類型
 * @returns {Promise<Object>} 解析結果
 */
export async function parseDocument(fileBuffer, fileName, mimeType) {
  const ext = fileName?.toLowerCase()?.split('.').pop() || '';
  const type = mimeType?.toLowerCase() || '';

  let result = {
    success: false,
    content_text: '',
    pages: [],
    images: [],
    metadata: {
      fileName,
      mimeType,
      parseMethod: 'unknown',
      fileSize: fileBuffer?.length || 0
    },
    chunks: []
  };

  try {
    // 根據文件類型路由到對應的解析器
    if (type.includes('pdf') || ext === 'pdf') {
      console.log(`[文件解析] 開始解析 PDF: ${fileName}`);
      const pdfResult = await parsePDFEnhanced(fileBuffer);
      result.metadata.parseMethod = pdfResult.isScanned ? 'pdf_vision_ocr' : 'pdf_text';
      result.metadata.pageCount = pdfResult.pageCount;

      if (pdfResult.needsVisionOCR) {
        console.log(`[文件解析] PDF 疑似掃描版，使用 Vision OCR (${pdfResult.pageCount} 頁)`);
        // Claude 可以直接處理 PDF base64
        const base64 = fileBuffer.toString('base64');
        const ocrText = await extractTextWithVision({
          base64,
          mediaType: 'application/pdf'
        });
        result.content_text = ocrText;
      } else {
        result.content_text = pdfResult.text;
      }

    } else if (type.includes('word') || type.includes('document') || ext === 'docx' || ext === 'doc') {
      console.log(`[文件解析] 開始解析 Word: ${fileName}`);
      const wordResult = await parseWordEnhanced(fileBuffer);
      result.content_text = wordResult.text;
      result.metadata.parseMethod = wordResult.hasImages ? 'word_with_vision' : 'word_text';

      if (wordResult.images.length > 0) {
        console.log(`[文件解析] Word 包含 ${wordResult.images.length} 張圖片，使用 Vision OCR`);
        // OCR 每張嵌入圖片並附加到文字
        for (let i = 0; i < wordResult.images.length; i++) {
          try {
            const imgText = await extractTextWithVision(wordResult.images[i]);
            result.content_text += `\n\n[圖片 ${i + 1} 內容]\n${imgText}`;
          } catch (imgErr) {
            console.error(`[文件解析] 圖片 ${i + 1} OCR 失敗:`, imgErr.message);
            result.content_text += `\n\n[圖片 ${i + 1} OCR 失敗: ${imgErr.message}]`;
          }
        }
        result.images = wordResult.images.map((img, i) => ({
          index: i,
          mediaType: img.mediaType
        }));
      }

    } else if (type.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
      console.log(`[文件解析] 開始解析圖片: ${fileName}`);
      const imgResult = parseImage(fileBuffer, mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`);
      const ocrText = await extractTextWithVision(imgResult);
      result.content_text = ocrText;
      result.metadata.parseMethod = 'image_vision_ocr';

    } else if (type.includes('text') || ext === 'txt') {
      console.log(`[文件解析] 開始解析純文字: ${fileName}`);
      result.content_text = fileBuffer.toString('utf-8');
      result.metadata.parseMethod = 'plaintext';

    } else {
      return {
        ...result,
        success: false,
        error: `不支援的檔案格式: ${mimeType || ext}`,
        supported: ['PDF', 'Word (.docx)', '圖片 (JPG/PNG/GIF/WebP)', '純文字 (.txt)']
      };
    }

    // 清理文字
    result.content_text = cleanText(result.content_text);

    // 大文件分段
    result.chunks = chunkText(result.content_text);
    result.metadata.chunkCount = result.chunks.length;
    result.metadata.totalCharacters = result.content_text.length;

    result.success = result.content_text.length >= 10;
    if (!result.success) {
      result.error = '無法從文件中提取有效內容';
    }

    console.log(`[文件解析] 完成: ${fileName}, 方法=${result.metadata.parseMethod}, 字元=${result.metadata.totalCharacters}, 分段=${result.metadata.chunkCount}`);
    return result;

  } catch (error) {
    console.error(`[文件解析] 錯誤: ${fileName}`, error);
    return {
      ...result,
      success: false,
      error: `解析失敗: ${error.message}`
    };
  }
}

// ============================================================
// PDF 解析（增強版）
// ============================================================

/**
 * 增強版 PDF 解析：先嘗試文字提取，若失敗則標記為需要 Vision OCR
 * @param {Buffer} buffer - PDF buffer
 * @returns {Promise<Object>} 解析結果
 */
async function parsePDFEnhanced(buffer) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const textResult = await pdfParse(buffer);

    // 檢查文字提取是否有意義
    // 每頁少於 50 字元可能是掃描版 PDF
    const pageCount = textResult.numpages || 1;
    const avgCharsPerPage = textResult.text.trim().length / pageCount;
    const isScanned = avgCharsPerPage < 50;

    console.log(`[PDF 解析] 頁數=${pageCount}, 總字元=${textResult.text.trim().length}, 平均每頁=${Math.round(avgCharsPerPage)} 字元, 掃描版=${isScanned}`);

    if (isScanned || textResult.text.trim().length < 100) {
      return {
        text: textResult.text,
        isScanned: true,
        pageCount,
        needsVisionOCR: true
      };
    }

    return {
      text: textResult.text,
      isScanned: false,
      pageCount,
      needsVisionOCR: false
    };
  } catch (error) {
    console.error('[PDF 解析] pdf-parse 失敗:', error.message);
    // pdf-parse 失敗時，嘗試用 Vision OCR
    return {
      text: '',
      isScanned: true,
      pageCount: 0,
      needsVisionOCR: true
    };
  }
}

// ============================================================
// Word 解析（增強版，含圖片）
// ============================================================

/**
 * 增強版 Word 解析：提取文字和嵌入圖片
 * @param {Buffer} buffer - Word buffer
 * @returns {Promise<Object>} 解析結果
 */
async function parseWordEnhanced(buffer) {
  try {
    const mammoth = await import('mammoth');

    // 提取純文字
    const textResult = await mammoth.extractRawText({ buffer });

    // 提取 HTML 以偵測圖片
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const hasImages = htmlResult.value.includes('<img');

    // 提取嵌入圖片
    const images = [];
    if (hasImages) {
      try {
        await mammoth.convertToHtml({
          buffer,
          convertImage: mammoth.images.imgElement(function (image) {
            return image.read('base64').then(function (imageBase64) {
              images.push({
                base64: imageBase64,
                mediaType: image.contentType || 'image/png'
              });
              return { src: `[IMAGE_${images.length}]` };
            });
          })
        });
        console.log(`[Word 解析] 提取到 ${images.length} 張嵌入圖片`);
      } catch (imgErr) {
        console.error('[Word 解析] 圖片提取失敗:', imgErr.message);
      }
    }

    return {
      text: textResult.value,
      images,
      hasImages,
      needsVisionOCR: images.length > 0
    };
  } catch (error) {
    console.error('[Word 解析] mammoth 失敗:', error.message);
    throw new Error('Word 解析失敗: ' + error.message);
  }
}

// ============================================================
// 圖片解析
// ============================================================

/**
 * 準備圖片資料供 Vision OCR 使用
 * @param {Buffer} buffer - 圖片 buffer
 * @param {string} mimeType - MIME 類型
 * @returns {Object} 圖片資料
 */
function parseImage(buffer, mimeType) {
  const base64 = buffer.toString('base64');

  // 確保 mediaType 是 Claude Vision 支援的格式
  let mediaType = mimeType || 'image/jpeg';
  const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  // BMP 轉為 PNG（Claude 不直接支援 BMP）
  if (mediaType === 'image/bmp' || mediaType === 'image/x-bmp') {
    console.log('[圖片解析] BMP 格式，將嘗試以 image/png 送出');
    mediaType = 'image/png';
  }

  if (!supportedTypes.includes(mediaType) && mediaType !== 'application/pdf') {
    console.log(`[圖片解析] 不確定的圖片格式 ${mediaType}，預設使用 image/jpeg`);
    mediaType = 'image/jpeg';
  }

  return {
    type: 'image',
    base64,
    mediaType,
    needsVisionOCR: true
  };
}

// ============================================================
// Claude Vision OCR
// ============================================================

/**
 * 使用 Claude Vision API 從圖片或 PDF 中提取文字
 * @param {Object|Array} imageData - 單張圖片 { base64, mediaType } 或圖片陣列
 * @param {number} [pageNumber] - 頁碼（可選）
 * @param {number} [totalPages] - 總頁數（可選）
 * @returns {Promise<string>} 提取的文字
 */
async function extractTextWithVision(imageData, pageNumber, totalPages) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    throw new Error('缺少 ANTHROPIC_API_KEY，無法進行 Vision OCR');
  }

  // 統一為陣列
  if (!Array.isArray(imageData)) {
    imageData = [imageData];
  }

  // Claude 每次最多 20 張圖片，我們用 10 張為安全限制
  // 如果超過，分批處理
  if (imageData.length > MAX_IMAGES_PER_REQUEST) {
    console.log(`[Vision OCR] 圖片數量 ${imageData.length} 超過限制，分批處理`);
    return await extractTextWithVisionBatched(imageData, totalPages);
  }

  const content = [];

  // 加入圖片
  for (const img of imageData) {
    // PDF 使用 document 類型，圖片使用 image 類型
    if (img.mediaType === 'application/pdf') {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: img.base64
        }
      });
    } else {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType,
          data: img.base64
        }
      });
    }
  }

  // 加入提示文字
  content.push({
    type: 'text',
    text: buildOCRPrompt(pageNumber, totalPages)
  });

  console.log(`[Vision OCR] 送出 ${imageData.length} 個文件/圖片到 Claude Vision`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content
      }]
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    let errMsg = `Vision OCR API 錯誤 (${response.status})`;
    try {
      const errJson = JSON.parse(errBody);
      errMsg = `Vision OCR 失敗: ${errJson.error?.message || errBody}`;
    } catch (e) {
      errMsg += `: ${errBody.substring(0, 200)}`;
    }
    throw new Error(errMsg);
  }

  const data = await response.json();
  const extractedText = data.content[0]?.text || '';
  console.log(`[Vision OCR] 提取到 ${extractedText.length} 字元`);
  return extractedText;
}

/**
 * 分批處理大量圖片的 Vision OCR
 * @param {Array} imageDataArray - 圖片資料陣列
 * @param {number} totalPages - 總頁數
 * @returns {Promise<string>} 合併後的文字
 */
async function extractTextWithVisionBatched(imageDataArray, totalPages) {
  const results = [];
  const total = totalPages || imageDataArray.length;

  for (let i = 0; i < imageDataArray.length; i += MAX_IMAGES_PER_REQUEST) {
    const batch = imageDataArray.slice(i, i + MAX_IMAGES_PER_REQUEST);
    const startPage = i + 1;
    const endPage = Math.min(i + MAX_IMAGES_PER_REQUEST, imageDataArray.length);

    console.log(`[Vision OCR 分批] 處理第 ${startPage}-${endPage} 頁，共 ${total} 頁`);

    const batchText = await extractTextWithVision(
      batch,
      startPage,
      total
    );
    results.push(batchText);
  }

  return results.join('\n\n---\n\n');
}

/**
 * 建構 OCR 提示文字
 * @param {number} [pageNumber] - 頁碼
 * @param {number} [totalPages] - 總頁數
 * @returns {string} 提示文字
 */
function buildOCRPrompt(pageNumber, totalPages) {
  let prompt = `請仔細閱讀以上圖片中的所有文字內容，包括：
- 所有文字段落
- 表格內容（保持表格格式）
- 圖表中的標題、標籤、數字
- 頁首頁尾
- 手寫文字（如有）
- 印章或簽名旁的文字

請完整、精確地輸出所有文字內容，不要遺漏任何資訊。
如果有表格，請用 | 分隔欄位的格式呈現。`;

  if (pageNumber) {
    prompt += `\n這是第 ${pageNumber} 頁，共 ${totalPages} 頁。`;
  }

  return prompt;
}

// ============================================================
// 大文件分段
// ============================================================

/**
 * 將長文字切分成多段，在段落或句子邊界切割
 * @param {string} text - 原始文字
 * @param {number} [maxSize] - 每段最大字元數
 * @returns {string[]} 分段陣列
 */
export function chunkText(text, maxSize = MAX_CHUNK_SIZE) {
  if (!text || text.length <= maxSize) return [text || ''];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;

    // 嘗試在段落或句子邊界切割
    if (end < text.length) {
      // 優先在段落分隔處切割
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      // 中文句號
      const chineseSentenceBreak = text.lastIndexOf('。', end);
      // 英文句號加空格
      const englishSentenceBreak = text.lastIndexOf('. ', end);
      // 換行
      const lineBreak = text.lastIndexOf('\n', end);

      if (paragraphBreak > start + maxSize * 0.5) {
        end = paragraphBreak + 2;
      } else if (chineseSentenceBreak > start + maxSize * 0.5) {
        end = chineseSentenceBreak + 1;
      } else if (englishSentenceBreak > start + maxSize * 0.5) {
        end = englishSentenceBreak + 2;
      } else if (lineBreak > start + maxSize * 0.5) {
        end = lineBreak + 1;
      }
      // 否則在 maxSize 處硬切
    }

    chunks.push(text.substring(start, end));
    start = end;
  }

  console.log(`[分段] 共 ${text.length} 字元，切分為 ${chunks.length} 段`);
  return chunks;
}

// ============================================================
// 文字清理
// ============================================================

/**
 * 清理提取的文字內容
 * @param {string} text - 原始文字
 * @returns {string} 清理後的文字
 */
export function cleanText(text) {
  if (!text) return '';
  return text
    // 移除控制字元（保留換行和 tab）
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 限制連續換行為最多兩個
    .replace(/\n{3,}/g, '\n\n')
    // 移除首尾空白
    .trim();
}

// ============================================================
// 匯出輔助函數（供外部使用）
// ============================================================

export { extractTextWithVision };
