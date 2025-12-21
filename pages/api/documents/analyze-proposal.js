// 智能建案 API - 分析簽約提案書並提取專案資訊
import { supabase } from '../../../utils/supabaseClient';
import formidable from 'formidable';
import fs from 'fs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const config = {
  api: {
    bodyParser: false, // 使用 formidable 處理文件上傳
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: '缺少 Anthropic API Key',
      hint: '請在 .env.local 中設定 ANTHROPIC_API_KEY'
    });
  }

  try {
    // 解析上傳的文件
    const { fields, files } = await parseForm(req);

    const file = files.file?.[0] || files.file;
    if (!file) {
      return res.status(400).json({ error: '請上傳提案書文件' });
    }

    // 讀取文件並解析文字
    const fileBuffer = fs.readFileSync(file.filepath || file.path);
    const fileName = file.originalFilename || file.name || 'document';
    const fileType = file.mimetype || '';

    let extractedText = '';

    if (fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
      extractedText = await parsePDF(fileBuffer);
    } else if (
      fileType.includes('word') ||
      fileType.includes('document') ||
      fileName.toLowerCase().endsWith('.docx') ||
      fileName.toLowerCase().endsWith('.doc')
    ) {
      extractedText = await parseWord(fileBuffer);
    } else if (fileType.includes('text') || fileName.toLowerCase().endsWith('.txt')) {
      extractedText = fileBuffer.toString('utf-8');
    } else {
      return res.status(400).json({
        error: '不支援的文件格式',
        supported: ['PDF', 'Word (.docx)', 'Text (.txt)'],
        received: fileType || fileName
      });
    }

    // 清理文字
    extractedText = cleanText(extractedText);

    if (!extractedText || extractedText.length < 50) {
      return res.status(400).json({
        error: '無法從文件中提取有效內容',
        hint: '請確認文件不是掃描圖片或空白文件'
      });
    }

    // 使用 Claude 分析提案書
    const analysisResult = await analyzeWithClaude(extractedText);

    // 清理臨時文件
    try {
      fs.unlinkSync(file.filepath || file.path);
    } catch (e) {
      // 忽略刪除錯誤
    }

    return res.status(200).json({
      success: true,
      extracted_text_length: extractedText.length,
      extracted_text_preview: extractedText.substring(0, 500) + '...',
      analysis: analysisResult
    });

  } catch (error) {
    console.error('提案書分析錯誤:', error);
    return res.status(500).json({
      error: '分析失敗',
      details: error.message
    });
  }
}

// 解析表單
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 20 * 1024 * 1024, // 20MB
      keepExtensions: true
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// PDF 解析
async function parsePDF(buffer) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('PDF 解析錯誤:', error);
    throw new Error('PDF 解析失敗: ' + error.message);
  }
}

// Word 解析
async function parseWord(buffer) {
  try {
    const mammoth = await import('mammoth');
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
    .replace(/\s+/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 使用 Claude 分析提案書
async function analyzeWithClaude(documentText) {
  const systemPrompt = `你是一個專業的文件分析助手。你的任務是從簽約提案書或合約文件中提取關鍵的專案資訊。

請分析文件內容，提取以下資訊並以 JSON 格式回傳：

{
  "client_name": "客戶/公司名稱",
  "project_name": "專案名稱",
  "amount": 數字（合約金額，只填數字不含貨幣符號），
  "currency": "TWD 或 USD 等貨幣代碼",
  "payment_terms": "付款條件描述，例如：簽約50%、驗收50%",
  "payment_installments": [
    { "name": "期款名稱", "percentage": 百分比數字, "amount": 金額數字 }
  ],
  "project_type": "new 或 renewal（新專案或續約）",
  "start_date": "專案開始日期 YYYY-MM-DD 或 null",
  "end_date": "專案結束日期 YYYY-MM-DD 或 null",
  "duration_months": 專案期程月數或 null,
  "scope_summary": "專案範圍簡述（100字以內）",
  "contact_person": "客戶聯絡人姓名或 null",
  "contact_email": "聯絡人 email 或 null",
  "contact_phone": "聯絡人電話或 null",
  "notes": "其他重要備註",
  "confidence": "high/medium/low 分析信心度"
}

注意事項：
1. 金額請轉換為數字，例如 "50萬" 轉為 500000, "1,000,000" 轉為 1000000
2. 如果某項資訊無法確定，請填 null
3. payment_installments 請根據付款條件拆解成各期款項
4. 只回傳 JSON，不要加入其他說明文字`;

  const userPrompt = `請分析以下提案書/合約文件內容，提取專案資訊：

---
${documentText.substring(0, 15000)}
---

請以 JSON 格式回傳分析結果。`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Claude API 錯誤');
  }

  const data = await response.json();
  const responseText = data.content[0].text;

  // 嘗試解析 JSON
  try {
    // 移除可能的 markdown 代碼塊
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(responseText);
  } catch (parseError) {
    console.error('JSON 解析失敗:', parseError);
    return {
      raw_response: responseText,
      parse_error: '無法解析 AI 回應為 JSON'
    };
  }
}
