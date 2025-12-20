// AI 文件生成 API - 使用 Claude 根據歷史文件生成新文件
import { supabase } from '../../../utils/supabaseClient';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';

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

  const {
    document_type,      // 要生成的文件類型: proposal, specification, quotation
    client_name,        // 客戶名稱
    project_name,       // 專案名稱
    requirements,       // 需求描述
    budget_range,       // 預算範圍
    additional_context, // 其他背景資訊
    reference_count = 3 // 參考文件數量
  } = req.body;

  // 驗證必要參數
  if (!document_type || !requirements) {
    return res.status(400).json({
      error: '缺少必要參數',
      required: ['document_type', 'requirements']
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: '缺少 Anthropic API Key',
      hint: '請在 .env.local 中設定 ANTHROPIC_API_KEY'
    });
  }

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: '缺少 OpenAI API Key (用於搜尋相似文件)',
      hint: '請在 .env.local 中設定 OPENAI_API_KEY'
    });
  }

  try {
    // ===== STEP 1: 搜尋相似的歷史文件 =====
    const searchQuery = `${document_type} ${requirements} ${client_name || ''} ${project_name || ''}`;
    const queryEmbedding = await getEmbedding(searchQuery);

    // 手動搜尋相似文件
    const similarDocs = await searchSimilarDocuments(queryEmbedding, document_type, reference_count);

    // ===== STEP 2: 準備參考內容 =====
    const referenceContent = similarDocs.map((doc, index) => `
【參考文件 ${index + 1}】
文件類型: ${doc.document_type}
客戶名稱: ${doc.client_name || '未知'}
文件名稱: ${doc.document_name || '未命名'}
相似度: ${Math.round(doc.similarity * 100)}%
內容:
${doc.content_text}
---
`).join('\n');

    // ===== STEP 3: 建立 Claude 提示詞 =====
    const systemPrompt = getSystemPrompt(document_type);
    const userPrompt = buildUserPrompt({
      document_type,
      client_name,
      project_name,
      requirements,
      budget_range,
      additional_context,
      referenceContent,
      hasReferences: similarDocs.length > 0
    });

    // ===== STEP 4: 呼叫 Claude API =====
    const generatedContent = await callClaude(systemPrompt, userPrompt);

    // ===== STEP 5: 回傳結果 =====
    return res.status(200).json({
      success: true,
      document_type,
      client_name,
      project_name,
      generated_content: generatedContent,
      references_used: similarDocs.length,
      reference_documents: similarDocs.map(d => ({
        document_name: d.document_name,
        document_type: d.document_type,
        similarity: Math.round(d.similarity * 100) + '%'
      }))
    });

  } catch (error) {
    console.error('文件生成錯誤:', error);
    return res.status(500).json({ error: '生成失敗', details: error.message });
  }
}

// ===== 工具函數 =====

// 取得系統提示詞
function getSystemPrompt(documentType) {
  const prompts = {
    proposal: `你是川輝科技的專業提案撰寫專家。你的任務是根據客戶需求和歷史成功案例，撰寫專業、具有說服力的商業提案書。

提案書應包含：
1. 專案概述與目標
2. 解決方案說明
3. 技術規格與架構
4. 專案時程規劃
5. 團隊介紹
6. 投資效益分析
7. 為什麼選擇川輝科技

請使用繁體中文，保持專業但友善的語調。`,

    specification: `你是川輝科技的技術規格書撰寫專家。你的任務是根據需求撰寫清晰、完整的技術規格書。

規格書應包含：
1. 系統概述
2. 功能需求列表
3. 非功能性需求（效能、安全性、可用性）
4. 系統架構說明
5. 資料庫設計概要
6. API 規格（如適用）
7. 整合需求
8. 驗收標準

請使用繁體中文，確保技術描述準確且易於理解。`,

    quotation: `你是川輝科技的報價單撰寫專家。你的任務是根據專案需求撰寫清晰、合理的報價單。

報價單應包含：
1. 專案名稱與概述
2. 報價項目明細
3. 各項目的工時估算
4. 單價與總價
5. 付款條件建議
6. 報價有效期限
7. 備註與特殊條款

請使用繁體中文，確保價格合理且符合市場行情。`
  };

  return prompts[documentType] || prompts.proposal;
}

// 建立使用者提示詞
function buildUserPrompt({ document_type, client_name, project_name, requirements, budget_range, additional_context, referenceContent, hasReferences }) {
  const typeNames = {
    proposal: '提案書',
    specification: '規格書',
    quotation: '報價單'
  };

  let prompt = `請為以下專案撰寫${typeNames[document_type] || '文件'}：

【客戶資訊】
客戶名稱: ${client_name || '待確認'}
專案名稱: ${project_name || '待確認'}

【需求描述】
${requirements}
`;

  if (budget_range) {
    prompt += `\n【預算範圍】\n${budget_range}\n`;
  }

  if (additional_context) {
    prompt += `\n【補充資訊】\n${additional_context}\n`;
  }

  if (hasReferences && referenceContent) {
    prompt += `\n\n以下是類似專案的歷史文件，請參考其結構、用語和風格：\n${referenceContent}`;
  }

  prompt += `\n\n請根據以上資訊，生成一份完整的${typeNames[document_type] || '文件'}。`;

  return prompt;
}

// 搜尋相似文件
async function searchSimilarDocuments(queryEmbedding, documentType, limit) {
  let query = supabase
    .from('document_embeddings')
    .select('*');

  if (documentType) {
    query = query.eq('document_type', documentType);
  }

  const { data: embeddings, error } = await query.limit(50);

  if (error || !embeddings || embeddings.length === 0) {
    console.log('找不到參考文件，將生成全新內容');
    return [];
  }

  // 計算餘弦相似度並排序
  const results = embeddings
    .map(doc => {
      const embedding = typeof doc.embedding === 'string'
        ? JSON.parse(doc.embedding)
        : doc.embedding;
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      return { ...doc, similarity };
    })
    .filter(doc => doc.similarity >= 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return results;
}

// 取得 embedding
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

// 呼叫 Claude API
async function callClaude(systemPrompt, userPrompt) {
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
  return data.content[0].text;
}

// 餘弦相似度
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
