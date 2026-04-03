// AI Agent 執行引擎 - 解析 AI 意圖並執行系統操作
import { supabaseAdmin as supabase } from './supabaseAdmin';

// 權限等級對應角色
const PERMISSION_ROLES = {
  query: ['admin', 'finance', 'leader', 'pm', 'sales'],
  generate: ['admin', 'finance', 'leader', 'pm', 'sales'],
  modify: ['admin', 'finance', 'leader', 'pm'],
  financial: ['admin', 'finance'],
  delete: ['admin'],
};

// 操作註冊表 - 對應意圖與可執行函式
const OPERATIONS = {
  create_project: {
    permission: 'modify',
    needsConfirmation: true,
    execute: async (params, userId) => {
      // 生成專案編號: P-YYYYMMDD-XXX
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const random = String(Math.floor(Math.random() * 900) + 100);
      const projectCode = `P-${dateStr}-${random}`;

      const insertData = {
        project_code: projectCode,
        client_name: params.client_name,
        project_name: params.project_name || '',
        amount: params.amount || 0,
        type: params.type || 'new',
        sign_date: params.sign_date || null,
        assigned_to: params.assigned_to || userId,
        commission_type: params.commission_type || 'tiered',
        payment_template: params.payment_template || 'full',
      };

      const { data, error } = await supabase
        .from('projects')
        .insert([insertData])
        .select()
        .single();

      if (error) throw new Error(`建立專案失敗: ${error.message}`);
      return { project: data, message: `專案「${data.project_name || data.client_name}」建立成功（編號: ${data.project_code}）` };
    },
  },

  create_prospect: {
    permission: 'modify',
    needsConfirmation: true,
    execute: async (params, userId) => {
      const insertData = {
        client_name: params.client_name,
        project_name: params.project_name || '',
        estimated_amount: params.estimated_amount || 0,
        stage: params.stage || '初談',
        owner_id: params.owner_id || userId,
        source: params.source || null,
        note: params.note || null,
        expected_sign_date: params.expected_sign_date || null,
      };

      const { data, error } = await supabase
        .from('prospects')
        .insert([insertData])
        .select()
        .single();

      if (error) throw new Error(`建立商機失敗: ${error.message}`);
      return { prospect: data, message: `商機「${data.client_name} - ${data.project_name}」建立成功` };
    },
  },

  update_project_status: {
    permission: 'modify',
    needsConfirmation: true,
    execute: async (params, _userId) => {
      if (!params.project_id) throw new Error('缺少 project_id');
      if (!params.status) throw new Error('缺少 status');

      const { data, error } = await supabase
        .from('projects')
        .update({ status: params.status, updated_at: new Date().toISOString() })
        .eq('id', params.project_id)
        .select()
        .single();

      if (error) throw new Error(`更新專案狀態失敗: ${error.message}`);
      return { project: data, message: `專案狀態已更新為「${params.status}」` };
    },
  },

  update_milestone_status: {
    permission: 'modify',
    needsConfirmation: false,
    execute: async (params, _userId) => {
      if (!params.milestone_id) throw new Error('缺少 milestone_id');
      if (!params.status) throw new Error('缺少 status');

      const updateData = {
        status: params.status,
        updated_at: new Date().toISOString(),
      };

      // 若狀態為 completed，自動填入完成日期
      if (params.status === 'completed') {
        updateData.completed_date = new Date().toISOString().split('T')[0];
      }

      const { data, error } = await supabase
        .from('project_milestones')
        .update(updateData)
        .eq('id', params.milestone_id)
        .select()
        .single();

      if (error) throw new Error(`更新里程碑失敗: ${error.message}`);
      return { milestone: data, message: `里程碑「${data.title}」狀態已更新為「${params.status}」` };
    },
  },

  generate_proposal: {
    permission: 'generate',
    needsConfirmation: false,
    execute: async (params, _userId) => {
      // 呼叫現有的文件生成 API 邏輯
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_API_KEY) throw new Error('缺少 Anthropic API Key');

      const typeNames = {
        proposal: '提案書',
        specification: '規格書',
        quotation: '報價單',
      };

      const docType = params.document_type || 'proposal';
      const systemPrompt = `你是川輝科技的專業${typeNames[docType] || '文件'}撰寫專家。請根據客戶需求撰寫專業的${typeNames[docType] || '文件'}。使用繁體中文，保持專業但友善的語調。`;

      const userPrompt = `請為以下專案撰寫${typeNames[docType] || '文件'}：
客戶名稱: ${params.client_name || '待確認'}
專案名稱: ${params.project_name || '待確認'}
需求描述: ${params.requirements || '待補充'}
${params.budget_range ? `預算範圍: ${params.budget_range}` : ''}
${params.additional_context ? `補充資訊: ${params.additional_context}` : ''}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Claude API 錯誤');
      }

      const data = await response.json();
      const generatedContent = data.content[0].text;

      return {
        document_type: docType,
        content: generatedContent,
        message: `已產生${typeNames[docType] || '文件'}草稿`,
      };
    },
  },

  query_data: {
    permission: 'query',
    needsConfirmation: false,
    execute: async (params, _userId) => {
      // 查詢操作已由 AI 對話上下文處理，此為直通
      return { message: '查詢完成', params };
    },
  },
};

/**
 * 解析 AI 回應中的操作意圖
 * 偵測 ```action 區塊並回傳解析後的操作資料
 * @param {string} aiResponse - AI 的完整回應文字
 * @returns {{ action: string, params: object, confirmation_message?: string } | null}
 */
export function parseIntent(aiResponse) {
  if (!aiResponse) return null;

  const actionMatch = aiResponse.match(/```action\s*\n([\s\S]*?)\n```/);
  if (!actionMatch) return null;

  try {
    const actionData = JSON.parse(actionMatch[1].trim());
    if (!actionData.action) return null;

    // 驗證操作是否在註冊表中
    if (!OPERATIONS[actionData.action]) {
      console.warn(`未知的操作類型: ${actionData.action}`);
      return null;
    }

    return {
      action: actionData.action,
      params: actionData.params || {},
      confirmation_message: actionData.confirmation_message || null,
    };
  } catch (e) {
    console.error('解析 action 區塊失敗:', e.message);
    return null;
  }
}

/**
 * 檢查使用者是否具有執行操作的權限
 * @param {string} userId - 使用者 ID
 * @param {string} permissionLevel - 權限等級 (query/generate/modify/financial/delete)
 * @returns {Promise<boolean>}
 */
export async function checkPermission(userId, permissionLevel) {
  if (!permissionLevel) return false;
  if (!userId) return false;

  try {
    const { data: userData, error } = await supabase
      .from('users')
      .select('role, roles')
      .eq('id', userId)
      .single();

    if (error || !userData) return false;

    // 支援多角色
    const userRoles = userData.roles && Array.isArray(userData.roles)
      ? userData.roles
      : [userData.role || 'sales'];

    const allowedRoles = PERMISSION_ROLES[permissionLevel] || [];
    return userRoles.some(role => allowedRoles.includes(role));
  } catch (err) {
    console.error('權限檢查錯誤:', err);
    return false;
  }
}

/**
 * 執行已註冊的操作
 * @param {string} operationName - 操作名稱
 * @param {object} params - 操作參數
 * @param {string} userId - 執行者使用者 ID
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
export async function executeOperation(operationName, params, userId) {
  const operation = OPERATIONS[operationName];
  if (!operation) {
    return { success: false, error: `未知的操作: ${operationName}` };
  }

  // 權限檢查
  const hasPermission = await checkPermission(userId, operation.permission);
  if (!hasPermission) {
    return { success: false, error: `權限不足：此操作需要「${operation.permission}」等級權限` };
  }

  try {
    const result = await operation.execute(params, userId);
    return { success: true, data: result };
  } catch (err) {
    console.error(`操作執行失敗 [${operationName}]:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * 記錄 AI 助理指令到 assistant_commands 表
 * @param {object} data - 記錄資料
 * @param {string} data.userId - 使用者 ID
 * @param {string} data.commandType - 指令類型
 * @param {string} data.rawInput - 原始輸入
 * @param {object} data.parsedIntent - 解析後的意圖
 * @param {object} data.executionPlan - 執行計畫（參數）
 * @param {string} data.resultStatus - 執行結果狀態
 * @param {object} data.resultData - 執行結果資料
 * @param {string} data.errorMessage - 錯誤訊息
 * @returns {Promise<void>}
 */
export async function logCommand(data) {
  try {
    if (!supabase) return;

    await supabase.from('assistant_commands').insert([{
      actor_user_id: data.userId || null,
      channel: 'web_chat',
      command_type: data.commandType || 'unknown',
      raw_input: data.rawInput || '',
      parsed_intent: data.parsedIntent || null,
      execution_plan: data.executionPlan || null,
      result_status: data.resultStatus || 'pending',
      result_data: data.resultData || null,
      error_message: data.errorMessage || null,
      completed_at: data.resultStatus === 'success' || data.resultStatus === 'failed'
        ? new Date().toISOString()
        : null,
    }]);
  } catch (err) {
    // 記錄失敗不影響主流程
    console.error('記錄 AI 指令失敗:', err);
  }
}

/**
 * 取得操作的元資料
 * @param {string} operationName - 操作名稱
 * @returns {{ permission: string, needsConfirmation: boolean } | null}
 */
export function getOperationMeta(operationName) {
  const op = OPERATIONS[operationName];
  if (!op) return null;
  return {
    permission: op.permission,
    needsConfirmation: op.needsConfirmation,
  };
}
