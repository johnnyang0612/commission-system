// 智能建案 API - 分析簽約提案書並提取專案資訊（V2 增強版）
import { supabase } from '../../../utils/supabaseClient';
import { parseDocument } from '../../../utils/documentParser';
import formidable from 'formidable';
import fs from 'fs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const config = {
  api: {
    bodyParser: false, // 使用 formidable 處理文件上傳
    responseLimit: false,
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

    // 讀取文件
    const fileBuffer = fs.readFileSync(file.filepath || file.path);
    const fileName = file.originalFilename || file.name || 'document';
    const fileType = file.mimetype || '';

    console.log(`[智能建案] 開始解析文件: ${fileName}, 類型: ${fileType}, 大小: ${fileBuffer.length} bytes`);

    // 使用文件解析引擎 V2
    const parseResult = await parseDocument(fileBuffer, fileName, fileType);

    if (!parseResult.success) {
      return res.status(400).json({
        error: parseResult.error,
        supported: parseResult.supported,
        parse_method: parseResult.metadata?.parseMethod
      });
    }

    console.log(`[智能建案] 文件解析完成: 方法=${parseResult.metadata.parseMethod}, 字元=${parseResult.metadata.totalCharacters}, 分段=${parseResult.metadata.chunkCount}`);

    // 使用 Claude 分析提案書
    let analysisResult;
    if (parseResult.chunks.length > 1) {
      console.log(`[智能建案] 大文件模式: ${parseResult.chunks.length} 段分段分析`);
      analysisResult = await analyzeWithClaudeChunked(parseResult.chunks, parseResult.metadata);
    } else {
      analysisResult = await analyzeWithClaude(parseResult.content_text);
    }

    // 清理臨時文件
    try {
      fs.unlinkSync(file.filepath || file.path);
    } catch (e) {
      // 忽略刪除錯誤
    }

    return res.status(200).json({
      success: true,
      extracted_text_length: parseResult.content_text.length,
      extracted_text_preview: parseResult.content_text.substring(0, 500) + '...',
      parse_method: parseResult.metadata.parseMethod,
      chunk_count: parseResult.metadata.chunkCount,
      page_count: parseResult.metadata.pageCount,
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
      maxFileSize: 50 * 1024 * 1024, // 50MB
      keepExtensions: true
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// ============================================================
// Claude 分析函數
// ============================================================

const ANALYSIS_SYSTEM_PROMPT = `你是一個專業的文件分析助手。你的任務是從簽約提案書或合約文件中提取關鍵的專案資訊。

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
  "confidence": "high/medium/low 分析信心度",
  "signed_date": "合約簽訂日期 YYYY-MM-DD 或 null",
  "client_tax_id": "客戶統一編號或 null",
  "payment_schedules": [
    {
      "sequence_no": 1,
      "label": "簽約款",
      "percentage": 30,
      "trigger_description": "合約簽訂後"
    }
  ],
  "milestones": [
    {
      "title": "需求確認",
      "acceptance_criteria": "客戶簽核需求文件",
      "sequence_order": 1
    }
  ],
  "warranty": {
    "warranty_days": 30,
    "start_trigger": "acceptance",
    "scope": "系統功能缺陷修復"
  },
  "maintenance": {
    "enabled": true,
    "monthly_fee": 5000,
    "start_rule": "warranty_end",
    "billing_cycle": "monthly"
  },
  "tax_rate": 0.05,
  "is_tax_included": true,
  "confidence_scores": {
    "client_name": 0.9,
    "amount": 0.8,
    "payment_schedules": 0.7,
    "milestones": 0.6,
    "warranty": 0.5,
    "maintenance": 0.5
  }
}

注意事項：
1. 金額請轉換為數字，例如 "50萬" 轉為 500000, "1,000,000" 轉為 1000000
2. 如果某項資訊無法確定，請填 null
3. payment_installments 保留以向後相容；同時填寫 payment_schedules（含 sequence_no, label, percentage, trigger_description）
4. payment_schedules 根據文件中的付款條件拆解，每期包含序號、名稱、百分比、觸發條件描述
5. milestones 提取交付/驗收里程碑，包含標題、驗收條件、順序
6. warranty 提取保固條件：天數、起算時機（acceptance/delivery/sign_date/custom）、範圍描述
7. maintenance 提取維護計畫：是否啟用、月費、起算規則（warranty_end/fixed_date/custom）、計費週期（monthly/quarterly/yearly）
8. tax_rate 稅率（台灣通常 0.05 即 5%），is_tax_included 金額是否含稅
9. confidence_scores 為各欄位的信心分數 0-1，根據文件中資訊明確程度給分
10. 如果文件中沒有提及保固或維護資訊，warranty 和 maintenance 填 null
11. 只回傳 JSON，不要加入其他說明文字`;

/**
 * 使用 Claude 分析提案書（單段）
 * @param {string} documentText - 文件文字內容
 * @param {boolean} [isMergePass] - 是否為合併階段（使用不同 prompt）
 * @returns {Promise<Object>} 分析結果
 */
async function analyzeWithClaude(documentText, isMergePass = false) {
  const userPrompt = isMergePass
    ? documentText  // 合併階段直接使用傳入的 prompt
    : `請分析以下提案書/合約文件內容，提取專案資訊：

---
${documentText.substring(0, 30000)}
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
      max_tokens: 4000,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    let errMsg = 'Claude API 錯誤';
    try {
      const errJson = JSON.parse(errBody);
      errMsg = errJson.error?.message || errMsg;
    } catch (e) {
      errMsg += `: ${errBody.substring(0, 200)}`;
    }
    throw new Error(errMsg);
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

/**
 * 分段分析大型文件
 * 先從每段提取資訊，再合併整理
 * @param {string[]} chunks - 文字分段陣列
 * @param {Object} metadata - 文件 metadata
 * @returns {Promise<Object>} 合併後的分析結果
 */
async function analyzeWithClaudeChunked(chunks, metadata) {
  console.log(`[分段分析] 開始分段分析: ${chunks.length} 段, 共 ${metadata.totalCharacters} 字`);

  // 第一步：從每段提取資訊
  const chunkResults = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`[分段分析] 處理第 ${i + 1}/${chunks.length} 段 (${chunks[i].length} 字元)`);

    const chunkPrompt = `這是一份文件的第 ${i + 1} 段（共 ${chunks.length} 段）。
請從這段內容中提取你能找到的任何專案資訊（客戶名稱、專案名稱、金額、付款條件、驗收點、保固、維護等）。
只提取這段中實際出現的資訊，沒有的欄位填 null。以 JSON 回傳。

---
${chunks[i]}
---`;

    try {
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
          messages: [{ role: 'user', content: chunkPrompt }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.content[0]?.text || '';
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            chunkResults.push(JSON.parse(jsonMatch[0]));
            console.log(`[分段分析] 第 ${i + 1} 段提取成功`);
          }
        } catch (e) {
          console.log(`[分段分析] 第 ${i + 1} 段 JSON 解析失敗，略過`);
        }
      } else {
        console.error(`[分段分析] 第 ${i + 1} 段 API 呼叫失敗: ${response.status}`);
      }
    } catch (err) {
      console.error(`[分段分析] 第 ${i + 1} 段處理錯誤:`, err.message);
    }
  }

  if (chunkResults.length === 0) {
    throw new Error('所有分段分析都失敗，無法提取專案資訊');
  }

  // 第二步：合併所有分段結果
  console.log(`[分段分析] 成功提取 ${chunkResults.length}/${chunks.length} 段，開始合併`);

  const mergePrompt = `以下是從一份大型合約/提案書中分段提取的資訊。請合併這些結果，選擇最完整、最可信的值，並以完整的 JSON 格式回傳最終分析結果。

分段提取結果：
${JSON.stringify(chunkResults, null, 2)}

請回傳與標準格式完全一致的 JSON（包含 client_name, project_name, amount, currency, payment_terms, payment_installments, payment_schedules, milestones, warranty, maintenance, confidence_scores 等所有欄位）。
合併規則：
- 選擇最具體、最完整的值
- 金額相關取最明確的數字
- 付款條件/里程碑合併所有不重複的項目
- 信心分數根據資訊來源數量和一致性給分
- 只回傳 JSON，不要加入其他說明文字`;

  return await analyzeWithClaude(mergePrompt, true);
}
