// Unified Agent Core
// Shared between Web AI Chat and LINE assistant
// Provides a single entry point for intent detection, permission checking,
// context gathering, AI response, and audit logging.

import { supabase } from './supabaseClient';
import { logAssistantAction, updateAssistantAction } from './assistantLogger';
import { executeOperation, checkPermission, parseIntent } from './agentExecutor';

// ---------------------------------------------------------------------------
// Intent detection from natural language
// ---------------------------------------------------------------------------

const INTENT_PATTERNS = [
  { pattern: /建立會議|\/會議|\/meeting/i, intent: 'create_meeting' },
  { pattern: /綁定[Ee]mail|綁定 [Ee]mail|\/綁定/i, intent: 'bind_email' },
  { pattern: /取回|取檔|找檔/i, intent: 'retrieve_file' },
  { pattern: /@川輝|川輝AI|\/問|\/ask/i, intent: 'knowledge_query' },
  { pattern: /\/設定|\/setup/i, intent: 'setup' },
  { pattern: /建立.*專案|新增.*案件|開.*新案/i, intent: 'create_project' },
  { pattern: /建立.*商機|新增.*洽談/i, intent: 'create_prospect' },
  { pattern: /產.*提案|生成.*提案/i, intent: 'generate_proposal' },
  { pattern: /查.*收款|查.*付款|本月.*收款/i, intent: 'query_payments' },
  { pattern: /查.*分潤|分潤.*統計/i, intent: 'query_commissions' },
  { pattern: /查.*專案|查.*案件/i, intent: 'query_projects' },
];

/**
 * Detect intent from free-form text.
 * @param {string} text
 * @returns {string} One of the known intent strings, or 'general_query'.
 */
export function detectIntent(text) {
  if (!text) return 'general_query';
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return 'general_query';
}

// ---------------------------------------------------------------------------
// Resolve system userId from LINE user id (best-effort)
// ---------------------------------------------------------------------------

async function resolveUserId(userId, lineUserId) {
  if (userId) return userId;
  if (!lineUserId || !supabase) return null;

  try {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .single();
    return data?.id || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Context gathering (shared by all channels)
// ---------------------------------------------------------------------------

/**
 * Gather relevant context data from Supabase based on the message content
 * and the optional LINE group id.
 */
async function gatherContext(message, { groupId = null } = {}) {
  if (!supabase) return '';
  const sections = [];

  // -- LINE group context (messages, group linkage) --
  if (groupId) {
    try {
      const { data: messages } = await supabase
        .from('line_messages')
        .select('content, sender_name, timestamp')
        .eq('group_id', groupId)
        .eq('message_type', 'text')
        .order('timestamp', { ascending: false })
        .limit(50);

      if (messages?.length) {
        sections.push(
          '## 近期群組訊息\n' +
          messages
            .slice()
            .reverse()
            .map(m => {
              const t = new Date(m.timestamp).toLocaleString('zh-TW', {
                timeZone: 'Asia/Taipei',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });
              return `[${t}] ${m.sender_name}: ${m.content}`;
            })
            .join('\n')
        );
      }
    } catch (e) {
      console.error('agentCore gatherContext 群組訊息錯誤:', e.message);
    }
  }

  // -- Keyword-driven context (same strategy as ai-chat.js) --
  try {
    if (/收款|付款|payment|請款|帳款|invoice/.test(message)) {
      const { data } = await supabase
        .from('project_installments')
        .select('*, project:project_id(client_name, project_name, project_code)')
        .order('payment_date', { ascending: false })
        .limit(20);
      if (data?.length) sections.push('## 近期付款資料\n' + JSON.stringify(data, null, 2));
    }

    if (/分潤|commission|佣金|獎金/.test(message)) {
      const { data } = await supabase
        .from('commissions')
        .select('*, project:project_id(client_name, project_name), user:user_id(name)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data?.length) sections.push('## 分潤資料\n' + JSON.stringify(data, null, 2));
    }

    if (/專案|案件|project|客戶|建案/.test(message)) {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data?.length) sections.push('## 專案資料\n' + JSON.stringify(data, null, 2));
    }

    if (/勞報|labor|報酬|勞務/.test(message)) {
      const { data } = await supabase
        .from('labor_receipts')
        .select('*, project:project_id(client_name, project_name), user:user_id(name)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data?.length) sections.push('## 勞報單資料\n' + JSON.stringify(data, null, 2));
    }

    if (/洽談|商機|prospect|pipeline|銷售/.test(message)) {
      const { data } = await supabase
        .from('prospects')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(20);
      if (data?.length) sections.push('## 洽談管道資料\n' + JSON.stringify(data, null, 2));
    }

    if (/統計|總覽|overview|summary|這個月|本月|多少|幾個|幾筆/.test(message)) {
      const { count: projectCount } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true });
      const { count: prospectCount } = await supabase
        .from('prospects')
        .select('*', { count: 'exact', head: true });
      const { data: payments } = await supabase
        .from('project_installments')
        .select('actual_amount')
        .eq('status', 'paid')
        .not('actual_amount', 'is', null);
      const totalReceived = (payments || []).reduce((s, p) => s + (p.actual_amount || 0), 0);

      sections.push(
        `## 系統統計\n- 專案總數: ${projectCount || 0}\n- 洽談中商機: ${prospectCount || 0}\n- 總收款: NT$ ${totalReceived.toLocaleString()}`
      );
    }
  } catch (e) {
    console.error('agentCore gatherContext 資料查詢錯誤:', e.message);
  }

  // Always include a handful of recent projects for general awareness
  if (sections.length === 0) {
    try {
      const { data: projects } = await supabase
        .from('projects')
        .select('client_name, project_name, amount, status')
        .order('created_at', { ascending: false })
        .limit(10);
      if (projects?.length) {
        sections.push('## 近期專案\n' + JSON.stringify(projects, null, 2));
      }
    } catch {
      // ignore
    }
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Unified knowledge query handler (works for both web and LINE)
// ---------------------------------------------------------------------------

async function handleKnowledgeQuery(query, groupId) {
  const contextData = await gatherContext(query, { groupId });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { success: false, response: '缺少 AI API Key' };
  }

  const systemPrompt =
    '你是川輝AI助理，負責回答關於群組討論歷史及系統資料的問題。\n\n' +
    '規則：\n' +
    '1. 只根據提供的資料回答，不要編造\n' +
    '2. 回答時必須標注來源（日期、會議名稱、或訊息時間）\n' +
    '3. 如果找不到答案，回答「在目前的記錄中沒有找到相關資訊」\n' +
    '4. 使用繁體中文，回答簡潔但完整\n' +
    '5. 回答長度盡量控制在 300 字以內\n\n' +
    contextData;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }],
    }),
  });

  if (!response.ok) {
    return { success: false, response: 'AI 回應失敗' };
  }

  const data = await response.json();
  return { success: true, response: data.content[0].text };
}

// ---------------------------------------------------------------------------
// AI-powered handler (general / operation-bearing queries)
// ---------------------------------------------------------------------------

async function handleWithAI(message, history, userId, groupId, channel) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { success: false, response: '缺少 AI API Key' };
  }

  // Resolve user info for the system prompt
  let userName = '用戶';
  let userRole = 'sales';
  if (userId && supabase) {
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('name, role')
        .eq('id', userId)
        .single();
      if (userData) {
        userName = userData.name || userName;
        userRole = userData.role || userRole;
      }
    } catch {
      // ignore
    }
  }

  const contextData = await gatherContext(message, { groupId });

  const today = new Date().toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const roleMap = { admin: '管理員', finance: '財務', leader: '主管', pm: 'PM', sales: '業務' };
  const channelLabel = {
    web_chat: '網頁聊天',
    line_group: 'LINE 群組',
    line_private: 'LINE 私訊',
    system: '系統',
  }[channel] || channel;

  const systemPrompt = `你是「川輝AI助理」，川輝科技內部業務分潤管理系統的智能助手。

## 你的角色
- 協助員工查詢專案、付款、分潤、勞報單等資訊
- 提供統計摘要和分析
- 協助撰寫提案書、規格書等文件草稿
- 引導使用者操作系統功能

## 當前資訊
- 今天日期：${today}
- 使用者：${userName}（角色：${roleMap[userRole] || userRole}）
- 頻道：${channelLabel}

## 系統功能說明
- 案件管理：管理客戶專案、付款期程、驗收追蹤
- 分潤管理：業務分潤計算（新案35%~10%階梯制，續約固定15%）
- 洽談管道：銷售漏斗管理（Kanban看板）
- 勞報單：勞務報酬單管理、PDF列印
- LINE整合：群組訊息記錄、AI摘要
- AI工具：文件生成、智能建案

## 你可以執行的操作

當使用者要求你執行以下操作時，你可以在回應中包含一個 JSON 操作區塊：

可執行操作：
- create_project: 建立新專案 (需要: client_name, project_name, amount；可選: type, sign_date, commission_type, payment_template)
- create_prospect: 建立新商機 (需要: client_name, project_name, estimated_amount；可選: stage, source, note, expected_sign_date)
- update_project_status: 更新專案狀態 (需要: project_id, status)
- update_milestone_status: 更新里程碑狀態 (需要: milestone_id, status；status 可為 pending/in_progress/completed/skipped)
- generate_proposal: 產生提案書草稿 (需要: client_name, project_name, requirements；可選: document_type, budget_range)

格式：在回應中加入以下 JSON 區塊（用 \`\`\`action 標記）：
\`\`\`action
{"action": "create_project", "params": {"client_name": "某某公司", "project_name": "官網改版", "amount": 350000}}
\`\`\`

重要規則：
1. 建立或修改操作前，先列出你要做的事讓使用者確認
2. 收到使用者確認後（如「好」「確認」「執行」「OK」），才在回應中放入 action 區塊
3. 查詢操作不需確認，直接回答
4. 如果使用者資訊不完整，先追問必要欄位
5. 每次回應最多包含一個 action 區塊
6. action 區塊之外，仍然用自然語言說明你做了什麼

## 回答原則
1. 使用繁體中文回答
2. 金額使用 NT$ 格式並加上千分位
3. 如果有系統資料，基於資料回答；如果沒有相關資料，誠實說明
4. 回答要簡潔明瞭，使用條列式呈現數據
5. 若使用者的問題需要操作系統但不在你的可執行範圍，指引使用者到對應頁面
6. 保持專業友善的語氣

## 頁面導引
- 儀表板：/dashboard
- 案件管理：/cases
- 財務管理：/finance
- 洽談管道：/prospects
- LINE群組：/line-integration
- AI工具：/ai-generator
- 設定：/settings

${contextData}`;

  const messages =
    history.length > 0
      ? [...history.slice(-20), { role: 'user', content: message }]
      : [{ role: 'user', content: message }];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    return { success: false, response: 'AI 回應失敗' };
  }

  const data = await response.json();
  const responseText = data.content[0].text;

  // Check for embedded action blocks
  const intentData = parseIntent(responseText);
  if (intentData) {
    const opResult = await executeOperation(intentData.action, intentData.params, userId);
    return {
      success: true,
      response: responseText,
      actionResult: opResult,
    };
  }

  return { success: true, response: responseText };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Process a request through the unified agent.
 *
 * @param {Object} request
 * @param {string}   request.message       - User's message
 * @param {string}   request.channel       - 'web_chat' | 'line_group' | 'line_private' | 'system'
 * @param {string}   [request.userId]      - System user ID (nullable for LINE)
 * @param {string}   [request.lineUserId]  - LINE user ID (nullable for web)
 * @param {string}   [request.groupId]     - LINE group ID (nullable)
 * @param {Object[]} [request.history]     - Conversation history (for web chat)
 * @param {string}   [request.replyToken]  - LINE reply token (nullable)
 * @param {Object}   [request.metadata]    - Additional context
 * @returns {Promise<Object>} { success, response, actionResult, commandId, intent }
 */
export async function processAgentRequest(request) {
  const {
    message,
    channel = 'system',
    userId: rawUserId = null,
    lineUserId = null,
    groupId = null,
    history = [],
    replyToken = null,
    metadata = {},
  } = request;

  // 1. Resolve system user id
  const userId = await resolveUserId(rawUserId, lineUserId);

  // 2. Detect intent
  const intent = detectIntent(message);

  // 3. Log the incoming command
  const commandId = await logAssistantAction({
    actorUserId: userId,
    channel,
    sourceGroupId: groupId,
    commandType: intent,
    rawInput: message,
    parsedIntent: { intent, metadata },
    resultStatus: 'executing',
  });

  try {
    let result;

    switch (intent) {
      // LINE-specific commands that have their own reply logic.
      // The agent marks them as "delegated" so the caller knows the
      // LINE handler will reply directly.
      case 'create_meeting':
      case 'bind_email':
      case 'retrieve_file':
      case 'setup':
        result = {
          success: true,
          response: null,
          delegated: true,
          intent,
        };
        break;

      // Knowledge query works for both web and LINE.
      case 'knowledge_query':
        result = await handleKnowledgeQuery(message, groupId);
        break;

      // System operations that modify data -- require permission.
      case 'create_project':
      case 'create_prospect':
      case 'generate_proposal': {
        if (userId) {
          const permLevel = intent === 'generate_proposal' ? 'generate' : 'modify';
          const hasPerms = await checkPermission(userId, permLevel);
          if (!hasPerms) {
            result = { success: false, response: '您沒有執行此操作的權限' };
            break;
          }
        }
        result = await handleWithAI(message, history, userId, groupId, channel);
        break;
      }

      // Read-only queries and everything else go through the AI handler.
      case 'query_payments':
      case 'query_commissions':
      case 'query_projects':
      default:
        result = await handleWithAI(message, history, userId, groupId, channel);
    }

    // 4. Update audit log with result
    if (commandId) {
      await updateAssistantAction(commandId, {
        resultStatus: result.success ? 'success' : 'failed',
        resultData: result.actionResult || null,
        errorMessage: result.error || null,
      });
    }

    return { ...result, commandId, intent };
  } catch (error) {
    console.error('Agent 處理失敗:', error);

    if (commandId) {
      await updateAssistantAction(commandId, {
        resultStatus: 'failed',
        errorMessage: error.message,
      });
    }

    return {
      success: false,
      response: `處理失敗: ${error.message}`,
      commandId,
      intent,
    };
  }
}

// ---------------------------------------------------------------------------
// Capability catalogue
// ---------------------------------------------------------------------------

/**
 * Return the list of capabilities the agent supports.
 * Useful for rendering help menus in both web and LINE UIs.
 */
export function getCapabilities() {
  return [
    { intent: 'create_meeting', label: '建立會議', channels: ['line_group'], permission: 'modify' },
    { intent: 'bind_email', label: '綁定 Email', channels: ['line_group'], permission: 'modify' },
    { intent: 'retrieve_file', label: '取回過期檔案', channels: ['line_group'], permission: 'query' },
    { intent: 'knowledge_query', label: '知識問答', channels: ['line_group', 'web_chat'], permission: 'query' },
    { intent: 'create_project', label: '建立專案', channels: ['web_chat'], permission: 'modify' },
    { intent: 'create_prospect', label: '建立商機', channels: ['web_chat'], permission: 'modify' },
    { intent: 'generate_proposal', label: '產生提案書', channels: ['web_chat', 'line_group'], permission: 'generate' },
    { intent: 'query_payments', label: '查詢收款', channels: ['web_chat', 'line_group'], permission: 'query' },
    { intent: 'query_commissions', label: '查詢分潤', channels: ['web_chat', 'line_group'], permission: 'query' },
    { intent: 'query_projects', label: '查詢專案', channels: ['web_chat', 'line_group'], permission: 'query' },
  ];
}
