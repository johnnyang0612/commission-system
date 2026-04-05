/**
 * 川輝 AI 公司大腦 — Wiki 引擎
 *
 * 基於 Karpathy LLM Knowledge Base 模式：
 * - Wiki 層：AI 寫的結構化 Markdown 文章
 * - RAG 層：向量搜尋作為 fallback
 * - Style Learning：學習使用者風格
 * - Correction Loop：從修正中學習
 *
 * 三個核心操作：
 * 1. Ingest（消化）— 新資料進來，AI 編譯更新 Wiki
 * 2. Query（查詢）— 問問題，先查 Wiki 再查 RAG
 * 3. Lint（巡檢）— 定期檢查 Wiki 健康度
 */

import { supabaseAdmin as supabase } from './supabaseAdmin';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ============================================
// 通用 AI 呼叫
// ============================================

async function callClaude(system, user, maxTokens = 4000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ============================================
// 1. INGEST — 消化新資料，更新 Wiki
// ============================================

export async function ingest({
  sourceType,    // 'document' | 'conversation' | 'meeting_note' | 'manual' | 'correction'
  content,
  title = '',
  clientName = '',
  projectId = null,
  userId = null,
}) {
  if (!supabase || !ANTHROPIC_API_KEY) throw new Error('Not configured');

  // 讀現有 Wiki 目錄
  const index = await getIndex();

  const system = `你是川輝科技的知識管理 AI。你負責維護公司的知識 Wiki。

現有 Wiki 目錄：
${index}

你的任務：分析新投餵的資料，決定要：
1. 建立哪些新文章
2. 更新哪些現有文章
3. 提取哪些記憶/規則

回傳嚴格 JSON：
{
  "articles_to_create": [
    {
      "path": "clients/客戶名.md",
      "category": "clients",
      "title": "文章標題",
      "content": "完整 Markdown 內容（包含 ## 段落、要點、連結到其他文章用 [[path]] 格式）",
      "summary": "一行摘要",
      "tags": ["tag1", "tag2"],
      "outlinks": ["其他文章的 path"]
    }
  ],
  "articles_to_update": [
    {
      "path": "現有文章 path",
      "append_content": "要新增到文章末尾的內容",
      "update_summary": "更新後的一行摘要（沒變就留 null）"
    }
  ],
  "memories": [
    {
      "category": "client_insight|best_practice|company_rule|lesson_learned",
      "content": "要記住的事",
      "related_client": "客戶名或 null"
    }
  ],
  "style_observations": {
    "writing_style": "觀察到的寫作風格特點（null 如果不適用）",
    "pricing_pattern": "觀察到的報價模式（null 如果不適用）"
  },
  "log_description": "一行描述這次消化做了什麼"
}

注意：
- 客戶文章放 clients/ 目錄
- 專案文章放 projects/ ���錄
- 公司知識放 company/ 目錄
- 經驗教訓放 lessons/ 目錄
- 應對策略放 playbooks/ 目錄
- 文章內容用繁體中文
- 用 [[path]] 連結其他文章
- 如果是提案書/合約/報價單，仔細分析結構和策略`;

  const user = `來源類型：${sourceType}
${title ? `標題：${title}` : ''}
${clientName ? `客戶：${clientName}` : ''}

內容：
"""
${content?.substring(0, 20000)}
"""`;

  const result = parseJSON(await callClaude(system, user, 6000));
  if (!result) throw new Error('AI analysis failed');

  const affectedPaths = [];

  // 建立新���章
  for (const article of (result.articles_to_create || [])) {
    if (!article.path || !article.content) continue;

    const { error } = await supabase.from('wiki_articles').upsert({
      path: article.path,
      category: article.category || article.path.split('/')[0] || 'company',
      title: article.title,
      content: article.content,
      summary: article.summary,
      tags: article.tags || [],
      outlinks: article.outlinks || [],
      source_count: 1,
      last_compiled_from: `${sourceType}: ${title || content?.substring(0, 50)}`,
    }, { onConflict: 'path' });

    if (!error) affectedPaths.push(article.path);
  }

  // 更新現有文章
  for (const update of (result.articles_to_update || [])) {
    if (!update.path) continue;

    const { data: existing } = await supabase
      .from('wiki_articles')
      .select('id, content, source_count, version')
      .eq('path', update.path)
      .single();

    if (existing && update.append_content) {
      const newContent = existing.content + '\n\n' + update.append_content;
      await supabase.from('wiki_articles').update({
        content: newContent,
        summary: update.update_summary || undefined,
        source_count: (existing.source_count || 0) + 1,
        version: (existing.version || 1) + 1,
        last_compiled_from: `${sourceType}: ${title || content?.substring(0, 50)}`,
      }).eq('id', existing.id);

      affectedPaths.push(update.path);
    }
  }

  // 更新反向連結
  await updateBacklinks(affectedPaths);

  // 儲存記憶
  for (const memory of (result.memories || [])) {
    if (!memory.content) continue;
    await supabase.from('ai_memories').insert({
      category: memory.category,
      content: memory.content,
      related_client: memory.related_client,
      related_user_id: userId,
      source: 'auto',
      confidence: 0.7,
    });
  }

  // 更新風格觀察
  if (result.style_observations && userId) {
    await updateStyleProfile(userId, result.style_observations);
  }

  // 寫 log
  await supabase.from('wiki_log').insert({
    operation: sourceType === 'correction' ? 'correction' : 'ingest',
    description: result.log_description || `消化 ${sourceType}: ${title}`,
    affected_articles: affectedPaths,
    details: { sourceType, title, clientName },
    created_by: userId,
  });

  // 更新 index 文章
  await rebuildIndex();

  return { success: true, affectedPaths, articlesCreated: result.articles_to_create?.length || 0, articlesUpdated: result.articles_to_update?.length || 0 };
}

// ============================================
// 2. QUERY — 查詢 Wiki（AI Chat 用）
// ============================================

export async function queryWiki(question, { userId = null, clientName = null } = {}) {
  if (!supabase || !ANTHROPIC_API_KEY) return { answer: '', sources: [] };

  // Step 1: 讀 index 找相關文章
  const index = await getIndex();

  const findSystem = `根據使用者問題和 Wiki 目錄，列出最相關的文章 path（最多 8 個）。
只回傳 JSON 陣列：["path1", "path2", ...]`;

  const paths = parseJSON(
    await callClaude(findSystem, `問題：${question}\n${clientName ? `相關客戶：${clientName}` : ''}\n\nWiki 目錄：\n${index}`, 500)
  );

  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return { answer: '', sources: [], wikiHit: false };
  }

  // Step 2: 讀取相關��章
  const { data: articles } = await supabase
    .from('wiki_articles')
    .select('path, title, content')
    .in('path', paths);

  if (!articles || articles.length === 0) {
    return { answer: '', sources: [], wikiHit: false };
  }

  // Step 3: 根據使用者風格回答
  let styleContext = '';
  if (userId) {
    const { data: style } = await supabase
      .from('style_profiles')
      .select('profile_type, content')
      .eq('user_id', userId);
    if (style?.length) {
      styleContext = '\n\n使用者風格偏好：\n' + style.map(s => `${s.profile_type}: ${s.content}`).join('\n');
    }
  }

  // 記錄 query 到 log
  await supabase.from('wiki_log').insert({
    operation: 'query',
    description: question.substring(0, 200),
    affected_articles: articles.map(a => a.path),
    created_by: userId,
  });

  // 更新文章引用次數
  for (const article of articles) {
    await supabase.rpc('increment_wiki_usage', { article_path: article.path }).catch(() => {});
  }

  return {
    answer: '', // 呼叫端自己組裝到 AI Chat 的 context
    wikiContext: articles.map(a => `## ${a.title}\n來源: wiki/${a.path}\n\n${a.content}`).join('\n\n---\n\n'),
    sources: articles.map(a => ({ path: a.path, title: a.title })),
    styleContext,
    wikiHit: true,
  };
}

// ============================================
// 3. LINT — 巡檢 Wiki 健康度
// ============================================

export async function lintWiki() {
  if (!supabase || !ANTHROPIC_API_KEY) throw new Error('Not configured');

  // 讀所有文章的摘���
  const { data: articles } = await supabase
    .from('wiki_articles')
    .select('path, title, summary, tags, backlinks, outlinks, source_count, updated_at')
    .order('updated_at', { ascending: true });

  if (!articles || articles.length === 0) return { issues: [], fixed: 0 };

  const articleList = articles.map(a =>
    `- ${a.path} | ${a.title} | tags: ${(a.tags||[]).join(',')} | sources: ${a.source_count} | backlinks: ${(a.backlinks||[]).length} | updated: ${a.updated_at?.substring(0,10)}`
  ).join('\n');

  const system = `你是川輝科技的 Wiki 維護員。檢查以下 Wiki 文章清單，找出問題。

回傳 JSON：
{
  "issues": [
    {
      "type": "orphan|stale|contradiction|missing_topic|missing_link",
      "path": "受影響的文章 path（或 null 如果是缺漏）",
      "description": "問題描述",
      "suggested_action": "建議修復方式",
      "priority": "high|medium|low"
    }
  ],
  "suggested_new_articles": [
    {
      "path": "建議新增的文章 path",
      "title": "建議標題",
      "reason": "為什麼需要這篇"
    }
  ]
}`;

  const result = parseJSON(await callClaude(system, `Wiki 文章清單：\n${articleList}`, 3000));

  if (result) {
    // 更新每篇文章的 lint 結果
    for (const issue of (result.issues || [])) {
      if (issue.path) {
        await supabase.from('wiki_articles').update({
          last_lint_at: new Date().toISOString(),
          lint_issues: [issue.description],
        }).eq('path', issue.path);
      }
    }

    // Log
    await supabase.from('wiki_log').insert({
      operation: 'lint',
      description: `巡檢完成：${result.issues?.length || 0} 個問題，${result.suggested_new_articles?.length || 0} 個建議`,
      details: result,
    });
  }

  return result || { issues: [], suggested_new_articles: [] };
}

// ============================================
// 4. CORRECTION — 使用者修正 AI 輸出
// ============================================

export async function learnFromCorrection({
  originalOutput,
  correctedOutput,
  contextType,  // 'proposal' | 'reply' | 'report' | 'email'
  clientName = null,
  userId,
}) {
  if (!supabase || !ANTHROPIC_API_KEY) return;

  // 1. AI 分析差異
  const system = `分析使用者對 AI 輸出的修改，提取寫作偏好和規則。

回傳 JSON：
{
  "diff_analysis": "使用者改了什麼、為什麼（2-3句話）",
  "extracted_rules": ["規則1：...", "規則2：..."],
  "style_updates": {
    "writing_style": "觀察到的寫作風格變化（null 如果不明顯）",
    "pricing_pattern": "觀察到的報價偏好變化（null 如果不適用）",
    "communication": "溝通風格偏好（null 如果不適用）"
  }
}`;

  const user = `文件類型：${contextType}
${clientName ? `客戶：${clientName}` : ''}

AI 原始輸出：
"""
${originalOutput?.substring(0, 5000)}
"""

使用者修改後：
"""
${correctedOutput?.substring(0, 5000)}
"""`;

  const analysis = parseJSON(await callClaude(system, user, 2000));

  // 2. 儲存修正記錄
  await supabase.from('ai_corrections').insert({
    user_id: userId,
    original_output: originalOutput?.substring(0, 10000),
    corrected_output: correctedOutput?.substring(0, 10000),
    diff_analysis: analysis?.diff_analysis,
    extracted_rules: analysis?.extracted_rules || [],
    context_type: contextType,
    client_name: clientName,
  });

  // 3. 更新風格檔案
  if (analysis?.style_updates && userId) {
    await updateStyleProfile(userId, analysis.style_updates);
  }

  // 4. 把規則存成記憶
  for (const rule of (analysis?.extracted_rules || [])) {
    await supabase.from('ai_memories').insert({
      category: 'correction',
      content: rule,
      context: `${contextType}${clientName ? ` (${clientName})` : ''}`,
      related_user_id: userId,
      related_client: clientName,
      source: 'correction',
      confidence: 0.9,
    });
  }

  // 5. 消化修正到 Wiki
  await ingest({
    sourceType: 'correction',
    content: `使用者修正了一份${contextType}。\n\n修改分析：${analysis?.diff_analysis}\n\n提取的規則：\n${(analysis?.extracted_rules || []).map(r => `- ${r}`).join('\n')}`,
    title: `風格修正：${contextType}`,
    clientName,
    userId,
  });

  // Log
  await supabase.from('wiki_log').insert({
    operation: 'correction',
    description: `使用者修正了${contextType}，提取了 ${analysis?.extracted_rules?.length || 0} 條規則`,
    details: { contextType, clientName, rules: analysis?.extracted_rules },
    created_by: userId,
  });

  return analysis;
}

// ============================================
// 輔助函數
// ============================================

async function getIndex() {
  const { data } = await supabase
    .from('wiki_articles')
    .select('path, title, summary, category, tags')
    .order('category')
    .order('title');

  if (!data || data.length === 0) return '（Wiki 目前是空的）';

  let currentCategory = '';
  return data.map(a => {
    const prefix = a.category !== currentCategory
      ? (currentCategory = a.category, `\n### ${a.category}/\n`)
      : '';
    return `${prefix}- [[${a.path}]] ${a.title}${a.summary ? ` — ${a.summary}` : ''}`;
  }).join('\n');
}

async function rebuildIndex() {
  const index = await getIndex();

  await supabase.from('wiki_articles').upsert({
    path: '_index.md',
    category: '_meta',
    title: '川輝科技知識 Wiki 總目錄',
    content: `# 川輝科技知識 Wiki\n\n> AI 自動維護的公司知識庫\n> 最後更新：${new Date().toISOString().substring(0, 10)}\n\n${index}`,
    summary: '所有 Wiki 文章的總目錄',
    tags: ['index', 'meta'],
  }, { onConflict: 'path' });
}

async function updateBacklinks(changedPaths) {
  for (const path of changedPaths) {
    const { data: article } = await supabase
      .from('wiki_articles')
      .select('content')
      .eq('path', path)
      .single();

    if (!article) continue;

    // 找到文章中的所有 [[link]]
    const links = [...(article.content.matchAll(/\[\[([^\]]+)\]\]/g))].map(m => m[1]);

    // 更新每個被連結的文章的 backlinks
    for (const link of links) {
      const { data: target } = await supabase
        .from('wiki_articles')
        .select('id, backlinks')
        .eq('path', link)
        .single();

      if (target) {
        const backlinks = [...new Set([...(target.backlinks || []), path])];
        await supabase.from('wiki_articles').update({ backlinks }).eq('id', target.id);
      }
    }
  }
}

async function updateStyleProfile(userId, observations) {
  for (const [type, observation] of Object.entries(observations)) {
    if (!observation) continue;

    const profileType = type === 'writing_style' ? 'writing_style'
      : type === 'pricing_pattern' ? 'pricing_pattern'
      : type === 'communication' ? 'communication'
      : type === 'decision_pattern' ? 'decision_pattern'
      : null;

    if (!profileType) continue;

    const { data: existing } = await supabase
      .from('style_profiles')
      .select('id, content, sample_count, confidence')
      .eq('user_id', userId)
      .eq('profile_type', profileType)
      .single();

    if (existing) {
      // 合併觀察到現有 profile
      const mergedContent = existing.content + '\n\n---\n\n' + `[${new Date().toISOString().substring(0, 10)}] ${observation}`;
      await supabase.from('style_profiles').update({
        content: mergedContent,
        sample_count: (existing.sample_count || 0) + 1,
        confidence: Math.min(1, (existing.confidence || 0.5) + 0.05),
        last_updated_from: 'auto_observation',
      }).eq('id', existing.id);
    } else {
      await supabase.from('style_profiles').insert({
        user_id: userId,
        profile_type: profileType,
        content: observation,
        sample_count: 1,
        confidence: 0.5,
        last_updated_from: 'auto_observation',
      });
    }
  }
}
