// AI Chat API - 川輝AI助理對話介面（含操作執行能力）
import { createClient } from '@supabase/supabase-js';
import { parseIntent, executeOperation, logCommand } from '../../utils/agentExecutor';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const config = {
  api: {
    bodyParser: { sizeLimit: '2mb' },
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history = [], userId } = req.body;

  if (!message) {
    return res.status(400).json({ error: '缺少訊息內容' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: '缺少 Anthropic API Key',
      hint: '請在 .env.local 中設定 ANTHROPIC_API_KEY'
    });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: '缺少 Supabase 設定' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // ===== 取得使用者資訊 =====
    let userName = '用戶';
    let userRole = 'sales';
    if (userId) {
      const { data: userData } = await supabase
        .from('users')
        .select('name, role')
        .eq('id', userId)
        .single();
      if (userData) {
        userName = userData.name || userName;
        userRole = userData.role || userRole;
      }
    }

    // ===== 根據角色決定資料可見範圍 =====
    // admin / finance: 看全部
    // leader: 看全部（主管權限）
    // pm: 看全部專案（但不含財務細節）
    // sales: 只看自己負責的
    const canSeeAll = ['admin', 'finance', 'leader', 'pm'].includes(userRole);
    const isSales = userRole === 'sales';
    const isFinancial = ['admin', 'finance'].includes(userRole);

    // 取得業務負責的專案 ID（sales 用）
    let myProjectIds = [];
    if (isSales && userId) {
      const { data: myProjects } = await supabase
        .from('projects')
        .select('id')
        .or(`assigned_to.eq.${userId},manager_id.eq.${userId}`);
      myProjectIds = (myProjects || []).map(p => p.id);
    }

    // Helper: 為 query 加上角色過濾
    function applyRoleFilter(query, projectIdColumn = 'project_id', userIdColumn = null) {
      if (canSeeAll) return query;
      if (isSales && userId) {
        if (myProjectIds.length > 0) {
          return query.in(projectIdColumn, myProjectIds);
        }
        if (userIdColumn) {
          return query.eq(userIdColumn, userId);
        }
        return query.eq(projectIdColumn, '00000000-0000-0000-0000-000000000000'); // 沒有自己的專案就不回傳
      }
      return query;
    }

    // ===== 根據訊息內容收集相關資料 =====
    let contextData = '';

    // 付款 / 收款相關
    if (/收款|付款|payment|請款|帳款|invoice/.test(message)) {
      let query = supabase
        .from('project_installments')
        .select('*, project:project_id(client_name, project_name, project_code)')
        .order('payment_date', { ascending: false })
        .limit(20);
      query = applyRoleFilter(query);
      const { data } = await query;
      if (data && data.length > 0) {
        contextData += '\n\n## 近期付款資料\n' + JSON.stringify(data, null, 2);
      }
    }

    // 分潤 / 佣金相關
    if (/分潤|commission|佣金|獎金/.test(message)) {
      let query = supabase
        .from('commissions')
        .select('*, project:project_id(client_name, project_name), user:user_id(name)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (isSales && userId) {
        query = query.eq('user_id', userId); // 業務只看自己的分潤
      }
      const { data } = await query;
      if (data && data.length > 0) {
        contextData += '\n\n## 分潤資料\n' + JSON.stringify(data, null, 2);
      }
    }

    // 專案 / 案件 / 客戶相關
    if (/專案|案件|project|客戶|建案/.test(message)) {
      let query = supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (isSales && userId) {
        query = query.or(`assigned_to.eq.${userId},manager_id.eq.${userId}`);
      }
      const { data } = await query;
      if (data && data.length > 0) {
        contextData += '\n\n## 專案資料\n' + JSON.stringify(data, null, 2);
      }
    }

    // 勞報單相關
    if (/勞報|labor|報酬|勞務/.test(message)) {
      let query = supabase
        .from('labor_receipts')
        .select('*, project:project_id(client_name, project_name), user:user_id(name)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (isSales && userId) {
        query = query.eq('user_id', userId); // 業務只看自己的勞報單
      }
      const { data } = await query;
      if (data && data.length > 0) {
        contextData += '\n\n## 勞報單資料\n' + JSON.stringify(data, null, 2);
      }
    }

    // 洽談 / 商機相關
    if (/洽談|商機|prospect|pipeline|銷售/.test(message)) {
      let query = supabase
        .from('prospects')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(20);
      if (isSales && userId) {
        query = query.eq('owner_id', userId); // 業務只看自己的商機
      }
      const { data } = await query;
      if (data && data.length > 0) {
        contextData += '\n\n## 洽談管道資料\n' + JSON.stringify(data, null, 2);
      }
    }

    // 統計 / 總覽相關
    if (/統計|總覽|overview|summary|這個月|本月|多少|幾個|幾筆/.test(message)) {
      if (canSeeAll) {
        // 管理層看全公司統計
        const { count: projectCount } = await supabase.from('projects').select('*', { count: 'exact', head: true });
        const { count: prospectCount } = await supabase.from('prospects').select('*', { count: 'exact', head: true });
        const { data: payments } = await supabase.from('project_installments').select('actual_amount').eq('status', 'paid').not('actual_amount', 'is', null);
        const totalReceived = (payments || []).reduce((sum, p) => sum + (p.actual_amount || 0), 0);
        contextData += `\n\n## 全公司統計\n- 專案總數: ${projectCount || 0}\n- 洽談中商機: ${prospectCount || 0}\n- 總收款: NT$ ${totalReceived.toLocaleString()}`;
      } else if (isSales && userId) {
        // 業務只看自己的統計
        const { count: myProjectCount } = await supabase.from('projects').select('*', { count: 'exact', head: true }).or(`assigned_to.eq.${userId},manager_id.eq.${userId}`);
        const { count: myProspectCount } = await supabase.from('prospects').select('*', { count: 'exact', head: true }).eq('owner_id', userId);
        const myInstallments = myProjectIds.length > 0
          ? await supabase.from('project_installments').select('actual_amount').eq('status', 'paid').not('actual_amount', 'is', null).in('project_id', myProjectIds)
          : { data: [] };
        const myReceived = (myInstallments.data || []).reduce((sum, p) => sum + (p.actual_amount || 0), 0);
        contextData += `\n\n## 你的個人統計\n- 你負責的專案: ${myProjectCount || 0}\n- 你的洽談商機: ${myProspectCount || 0}\n- 你的專案收款: NT$ ${myReceived.toLocaleString()}\n\n（注意：你只能查看自己負責的專案資料）`;
      }
    }

    // ===== 建立系統提示詞 =====
    const today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
    const roleMap = { admin: '管理員', finance: '財務', leader: '主管', pm: 'PM', sales: '業務' };

    const systemPrompt = `你是「川輝AI助理」，川輝科技內部業務分潤管理系統的智能助手。

## 你的角色
- 協助員工查詢專案、付款、分潤、勞報單等資訊
- 提供統計摘要和分析
- 協助撰寫提案書、規格書等文件草稿
- 引導使用者操作系統功能

## 當前資訊
- 今天日期：${today}
- 使用者：${userName}（角色：${roleMap[userRole] || userRole}）

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

## 使用者權限範圍
${isSales ? `⚠️ 此使用者是「業務」角色，只能查看自己負責的專案、分潤、勞報單。
- 不要提供全公司的數字或其他業務的資料
- 如果使用者問全公司數據，回答「此資訊僅限管理層查看」
- 回答時強調這是「你的」資料，例如「你目前有 3 個進行中的案件」` : ''}
${isFinancial ? '此使用者有財務權限，可查看全公司所有財務資料。' : ''}
${userRole === 'leader' ? '此使用者是主管，可查看全部專案與團隊資料。' : ''}
${userRole === 'pm' ? '此使用者是 PM，可查看全部專案但不含財務明細（分潤金額、勞報單金額）。' : ''}

## 回答原則
1. 使用繁體中文回答
2. 金額使用 NT$ 格式並加上千分位
3. 如果有系統資料，基於資料回答；如果沒有相關資料，誠實說明
4. 嚴格遵守權限範圍 — 不要透露超出使用者角色可見的資訊
4. 回答要簡潔明瞭，使用條列式呈現數據
5. 若使用者的問題需要操作系統但不在你的可執行範圍，指引使用者到對應頁面
6. 保持專業友善的語氣

## 頁面導引
- 儀表板：/dashboard
- 案件管理：/cases
- 財務管理：/finance
- 分潤管理：/commissions
- 付款記錄：/payments
- 勞報單：/labor-receipts
- 洽談管道：/prospects
- LINE群組：/line-integration
- AI工具：/ai-generator
- 設定：/settings${contextData}`;

    // ===== 組裝對話歷史 =====
    const conversationMessages = [];
    // 加入歷史訊息（最多保留最近20條）
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      conversationMessages.push({
        role: msg.role,
        content: msg.content
      });
    }
    // 加入當前訊息
    conversationMessages.push({ role: 'user', content: message });

    // ===== 呼叫 Claude API (streaming) =====
    // 設定 SSE 回應標頭
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

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
        stream: true,
        system: systemPrompt,
        messages: conversationMessages
      })
    });

    if (!response.ok) {
      const err = await response.json();
      // 如果 streaming 失敗，回傳錯誤
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.error?.message || 'Claude API 錯誤' })}\n\n`);
      res.end();
      return;
    }

    // 逐塊讀取 streaming 回應，同時收集完整文字以便後續偵測 action 區塊
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponseText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullResponseText += parsed.delta.text;
              res.write(`data: ${JSON.stringify({ type: 'delta', text: parsed.delta.text })}\n\n`);
            } else if (parsed.type === 'message_stop') {
              // 不在此處發送 done，等操作執行完畢後再發送
            } else if (parsed.type === 'error') {
              res.write(`data: ${JSON.stringify({ type: 'error', error: parsed.error?.message || '未知錯誤' })}\n\n`);
            }
          } catch (e) {
            // 忽略無法解析的行
          }
        }
      }
    }

    // ===== 偵測並執行 action 區塊 =====
    const intentData = parseIntent(fullResponseText);
    if (intentData) {
      try {
        const result = await executeOperation(intentData.action, intentData.params, userId);

        // 記錄指令到 assistant_commands
        await logCommand({
          userId,
          commandType: intentData.action,
          rawInput: message,
          parsedIntent: { action: intentData.action, params: intentData.params },
          executionPlan: intentData.params,
          resultStatus: result.success ? 'success' : 'failed',
          resultData: result.data || null,
          errorMessage: result.error || null,
        });

        // 發送操作執行結果給前端
        if (result.success) {
          res.write(`data: ${JSON.stringify({
            type: 'action_result',
            success: true,
            action: intentData.action,
            message: result.data?.message || '操作已完成',
            data: result.data,
          })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({
            type: 'action_result',
            success: false,
            action: intentData.action,
            error: result.error,
          })}\n\n`);
        }
      } catch (execError) {
        console.error('操作執行錯誤:', execError);
        // 記錄失敗
        await logCommand({
          userId,
          commandType: intentData.action,
          rawInput: message,
          parsedIntent: { action: intentData.action, params: intentData.params },
          executionPlan: intentData.params,
          resultStatus: 'failed',
          errorMessage: execError.message,
        });

        res.write(`data: ${JSON.stringify({
          type: 'action_result',
          success: false,
          action: intentData.action,
          error: execError.message,
        })}\n\n`);
      }
    }

    // 確保結束訊號
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    console.error('AI Chat 錯誤:', error);
    // 如果還沒開始 streaming，回傳 JSON 錯誤
    if (!res.headersSent) {
      return res.status(500).json({ error: '處理失敗', details: error.message });
    }
    // 如果已經在 streaming，發送錯誤事件
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
}
