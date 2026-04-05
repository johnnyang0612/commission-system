/**
 * 川輝 AI 知識消化引擎 (Knowledge Digestion Pipeline)
 *
 * 投餵任何內容 → AI 自動分析解構 → 分類儲存
 *
 * 支援：
 * 1. 文件（提案書/合約/規格書）→ 提取結構、客戶偏好、定價參考
 * 2. 對話記錄 → 提取客戶洞察、待辦、決策
 * 3. 會議紀錄 → 提取決議、分工、客戶顧慮
 * 4. 手動知識 → 直接分類儲存
 * 5. 使用者修正 → 記住為經驗法則
 */

import { supabaseAdmin as supabase } from './supabaseAdmin';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ============================================
// 主入口：消化任何內容
// ============================================

export async function digestContent({
  inputType,       // 'document' | 'conversation' | 'meeting_note' | 'manual' | 'correction'
  content,         // 文字內容
  fileUrl = null,  // 檔案 URL（如果有）
  source = '',     // 來源描述
  createdBy = null // user ID
}) {
  if (!supabase || !ANTHROPIC_API_KEY) {
    throw new Error('Missing supabase or ANTHROPIC_API_KEY');
  }

  // 1. 建立消化記錄
  const { data: logEntry } = await supabase
    .from('knowledge_digestion_log')
    .insert({
      input_type: inputType,
      input_content: content?.substring(0, 50000), // 限制大小
      input_file_url: fileUrl,
      input_source: source,
      status: 'processing',
      created_by: createdBy,
    })
    .select()
    .single();

  const logId = logEntry?.id;

  try {
    // 2. AI 分析解構
    const analysis = await analyzeContent(inputType, content);

    // 3. 分類儲存
    const results = await storeAnalysis(analysis, inputType, content, createdBy);

    // 4. 更新消化記錄
    if (logId) {
      await supabase.from('knowledge_digestion_log').update({
        status: 'completed',
        extracted_knowledge: analysis.knowledge || {},
        extracted_client_insights: analysis.clientInsights || {},
        extracted_memories: analysis.memories || [],
        created_knowledge_ids: results.knowledgeIds,
        created_memory_ids: results.memoryIds,
        updated_client_profile_id: results.clientProfileId,
        completed_at: new Date().toISOString(),
      }).eq('id', logId);
    }

    return { success: true, logId, analysis, results };

  } catch (error) {
    if (logId) {
      await supabase.from('knowledge_digestion_log').update({
        status: 'failed',
        error_message: error.message,
      }).eq('id', logId);
    }
    throw error;
  }
}

// ============================================
// AI 分析解構
// ============================================

async function analyzeContent(inputType, content) {
  const systemPrompt = `你是川輝科技的知識管理 AI。你的工作是分析輸入的內容，從中提取有價值的知識、客戶洞察和經驗法則。

根據輸入類型進行不同的分析：
- document（文件）：提取文件結構、客戶資訊、報價策略、技術方案、合約條款
- conversation（對話）：提取客戶態度、顧慮、決策線索、競爭資訊
- meeting_note（會議紀錄）：提取決議、分工、截止日、客戶回饋
- manual（手動知識）：直接分類為公司知識
- correction（修正）：提取為經驗法則或規則

回傳嚴格 JSON 格式：
{
  "knowledge": {
    "category": "sop|faq|pricing|technical|legal|process",
    "title": "知識標題",
    "content": "結構化的知識內容",
    "tags": ["標籤1", "標籤2"]
  },
  "clientInsights": {
    "client_name": "客戶名稱（如果提到）或 null",
    "industry": "產業（如果能判斷）或 null",
    "preferences": {"key": "value"},
    "pain_points": ["痛點1"],
    "budget_info": "預算相關資訊或 null",
    "decision_makers": ["決策者姓名"],
    "communication_style": "正式/友善/技術導向 或 null"
  },
  "memories": [
    {
      "category": "user_preference|client_insight|correction|best_practice|company_rule|lesson_learned",
      "content": "要記住的事情",
      "context": "在什麼情境下適用",
      "related_client": "相關客戶名稱或 null",
      "confidence": 0.8
    }
  ],
  "documentMeta": {
    "document_type": "proposal|contract|specification|quotation|other",
    "is_high_quality": true,
    "quality_notes": "為什麼品質好/不好",
    "reusable_sections": ["可重用的段落描述"]
  }
}

如果某個欄位無法從內容中提取，設為 null 或空陣列。不要編造不存在的資訊。`;

  const userPrompt = `輸入類型：${inputType}

內容：
"""
${content?.substring(0, 15000)}
"""

請分析上述內容並以 JSON 回傳。`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  // 提取 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { knowledge: {}, clientInsights: {}, memories: [], documentMeta: {} };
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { knowledge: {}, clientInsights: {}, memories: [], documentMeta: {} };
  }
}

// ============================================
// 分類儲存
// ============================================

async function storeAnalysis(analysis, inputType, content, createdBy) {
  const results = {
    knowledgeIds: [],
    memoryIds: [],
    clientProfileId: null,
  };

  // 1. 儲存知識到 knowledge_documents（如果有）
  if (analysis.knowledge?.title && analysis.knowledge?.content) {
    const { data } = await supabase.from('knowledge_documents').insert({
      document_type: analysis.knowledge.category || inputType,
      source_type: inputType,
      title: analysis.knowledge.title,
      description: analysis.knowledge.content,
      tags: analysis.knowledge.tags || [],
      status: 'active',
      visibility_scope: 'company',
      is_final_version: analysis.documentMeta?.is_high_quality || false,
      quality_score: analysis.documentMeta?.is_high_quality ? 0.8 : 0.5,
    }).select('id').single();

    if (data) results.knowledgeIds.push(data.id);
  }

  // 2. 更新客戶檔案（如果提到客戶）
  if (analysis.clientInsights?.client_name) {
    const clientName = analysis.clientInsights.client_name;
    const insights = analysis.clientInsights;

    // Upsert 客戶檔案
    const { data: existing } = await supabase
      .from('client_profiles')
      .select('id, preferences, pain_points, decision_makers')
      .eq('client_name', clientName)
      .single();

    if (existing) {
      // 合併新的洞察到現有檔案
      const mergedPrefs = {
        ...(existing.preferences || {}),
        ...(insights.preferences || {}),
      };
      const mergedPainPoints = [
        ...new Set([...(existing.pain_points || []), ...(insights.pain_points || [])]),
      ];
      const mergedDecisionMakers = [
        ...new Set([
          ...(existing.decision_makers?.map(d => typeof d === 'string' ? d : d.name) || []),
          ...(insights.decision_makers || []),
        ]),
      ];

      await supabase.from('client_profiles').update({
        preferences: mergedPrefs,
        pain_points: mergedPainPoints,
        decision_makers: mergedDecisionMakers.map(name => ({ name })),
        industry: insights.industry || undefined,
        communication_style: insights.communication_style || undefined,
        budget_tendency: insights.budget_info || undefined,
        last_interaction_at: new Date().toISOString(),
        last_enriched_at: new Date().toISOString(),
      }).eq('id', existing.id);

      results.clientProfileId = existing.id;
    } else {
      // 新建客戶檔案
      const { data: newProfile } = await supabase.from('client_profiles').insert({
        client_name: clientName,
        industry: insights.industry,
        preferences: insights.preferences || {},
        pain_points: insights.pain_points || [],
        decision_makers: (insights.decision_makers || []).map(name => ({ name })),
        communication_style: insights.communication_style,
        budget_tendency: insights.budget_info,
        auto_generated: true,
        last_interaction_at: new Date().toISOString(),
        last_enriched_at: new Date().toISOString(),
      }).select('id').single();

      if (newProfile) results.clientProfileId = newProfile.id;
    }
  }

  // 3. 儲存 AI 記憶
  if (analysis.memories?.length > 0) {
    for (const memory of analysis.memories) {
      if (!memory.content) continue;

      // 檢查是否有重複記憶
      const { data: duplicates } = await supabase
        .from('ai_memories')
        .select('id, content, confidence')
        .eq('category', memory.category)
        .eq('is_active', true)
        .ilike('content', `%${memory.content.substring(0, 50)}%`)
        .limit(1);

      if (duplicates?.length > 0) {
        // 已有類似記憶 → 提高信心分數
        await supabase.from('ai_memories').update({
          confidence: Math.min(1, (duplicates[0].confidence || 0.7) + 0.1),
          times_referenced: (duplicates[0].times_referenced || 0) + 1,
          last_referenced_at: new Date().toISOString(),
        }).eq('id', duplicates[0].id);
        results.memoryIds.push(duplicates[0].id);
      } else {
        // 新記憶
        const { data: newMemory } = await supabase.from('ai_memories').insert({
          category: memory.category,
          content: memory.content,
          context: memory.context,
          related_client: memory.related_client,
          related_user_id: createdBy,
          source: 'auto',
          confidence: memory.confidence || 0.7,
        }).select('id').single();

        if (newMemory) results.memoryIds.push(newMemory.id);
      }
    }
  }

  return results;
}

// ============================================
// 查詢記憶（給 AI Chat 用）
// ============================================

export async function recallMemories({
  query,            // 查詢文字
  clientName = null,// 特定客戶
  userId = null,    // 特定使用者
  categories = null,// 特定類別
  limit = 10,
}) {
  if (!supabase) return [];

  let q = supabase
    .from('ai_memories')
    .select('*')
    .eq('is_active', true)
    .order('confidence', { ascending: false })
    .order('times_referenced', { ascending: false })
    .limit(limit);

  if (clientName) q = q.eq('related_client', clientName);
  if (userId) q = q.eq('related_user_id', userId);
  if (categories) q = q.in('category', categories);

  // 文字搜尋
  if (query) {
    q = q.or(`content.ilike.%${query}%,context.ilike.%${query}%`);
  }

  const { data } = await q;
  return data || [];
}

// ============================================
// 查詢客戶檔案
// ============================================

export async function getClientProfile(clientName) {
  if (!supabase) return null;

  const { data } = await supabase
    .from('client_profiles')
    .select('*')
    .eq('client_name', clientName)
    .single();

  return data;
}

// ============================================
// 查詢所有客戶檔案
// ============================================

export async function listClientProfiles({ limit = 50 } = {}) {
  if (!supabase) return [];

  const { data } = await supabase
    .from('client_profiles')
    .select('*')
    .order('last_interaction_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  return data || [];
}

// ============================================
// 手動新增記憶
// ============================================

export async function addMemory({
  category,
  content,
  context = null,
  relatedClient = null,
  relatedUserId = null,
  confidence = 0.9,
}) {
  if (!supabase) return null;

  const { data } = await supabase.from('ai_memories').insert({
    category,
    content,
    context,
    related_client: relatedClient,
    related_user_id: relatedUserId,
    source: 'manual',
    confidence,
  }).select('id').single();

  return data?.id;
}
