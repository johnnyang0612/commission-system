// LINE 群組知識問答 API
// 根據群組歷史訊息、會議記錄、專案/洽談資料回答問題

import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';
import { sendLineReply, sendLinePush } from '../../../utils/lineReply';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// API handler（可直接呼叫）
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, group_id, user_id, reply_token } = req.body;

  if (!query || !group_id) {
    return res.status(400).json({ error: '缺少必要參數 (query, group_id)' });
  }

  try {
    const result = await handleKnowledgeQuery(query, group_id, user_id, reply_token);
    return res.status(200).json(result);
  } catch (error) {
    console.error('知識問答 API 錯誤:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * 處理群組知識問答
 * @param {string} query - 使用者問題
 * @param {string} groupId - LINE 群組 ID
 * @param {string} userId - LINE 用戶 ID
 * @param {string} replyToken - LINE replyToken
 */
export async function handleKnowledgeQuery(query, groupId, userId, replyToken) {
  console.log('知識問答:', query, '群組:', groupId);

  if (!ANTHROPIC_API_KEY) {
    const errMsg = '⚠️ AI 服務尚未設定，無法回答問題。';
    if (replyToken) await sendLineReply(replyToken, errMsg);
    return { success: false, error: '缺少 ANTHROPIC_API_KEY' };
  }

  if (!supabase) {
    const errMsg = '⚠️ 資料庫連線失敗，請稍後再試。';
    if (replyToken) await sendLineReply(replyToken, errMsg);
    return { success: false, error: '缺少 Supabase 連線' };
  }

  try {
    // 1. 收集群組上下文資料
    const contextData = await gatherGroupContext(groupId);

    // 2. 呼叫 Claude 回答問題
    const answer = await askClaude(query, contextData);

    // 3. 回覆到 LINE 群組
    const replyText = `🤖 川輝AI助理\n\n${answer}`;
    if (replyToken) {
      await sendLineReply(replyToken, replyText);
    } else {
      await sendLinePush(groupId, replyText);
    }

    return { success: true, answer, query };
  } catch (error) {
    console.error('知識問答處理失敗:', error);

    const errMsg = '⚠️ AI 回答時發生錯誤，請稍後再試。';
    try {
      if (replyToken) {
        await sendLineReply(replyToken, errMsg);
      }
    } catch (replyErr) {
      console.error('錯誤回覆也失敗:', replyErr);
    }

    return { success: false, error: error.message };
  }
}

/**
 * 收集群組相關的上下文資料
 */
async function gatherGroupContext(groupId) {
  const sections = [];

  // --- 1. 取得最近 100 則文字訊息 ---
  try {
    const { data: messages } = await supabase
      .from('line_messages')
      .select('content, sender_name, timestamp, message_type')
      .eq('group_id', groupId)
      .eq('message_type', 'text')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (messages && messages.length > 0) {
      // 按時間正序排列以便閱讀
      const sorted = messages.reverse();
      const msgText = sorted.map(m => {
        const time = formatTimeTaipei(m.timestamp);
        return `[${time}] ${m.sender_name}: ${m.content}`;
      }).join('\n');

      sections.push(`## 群組對話紀錄（最近 ${sorted.length} 則）\n${msgText}`);
    }
  } catch (e) {
    console.error('取得訊息失敗:', e.message);
  }

  // --- 2. 取得群組關聯 ---
  let group = null;
  try {
    const { data } = await supabase
      .from('line_groups')
      .select('prospect_id, project_id, group_name')
      .eq('group_id', groupId)
      .single();
    group = data;
  } catch (e) {
    console.error('取得群組資訊失敗:', e.message);
  }

  // --- 3. 取得會議記錄 ---
  try {
    if (group?.prospect_id || group?.project_id) {
      let meetingQuery = supabase
        .from('meeting_records')
        .select('title, meeting_date, content, analysis_result, summary, participants')
        .order('meeting_date', { ascending: false })
        .limit(10);

      // 使用 or 篩選相關會議
      const conditions = [];
      if (group.prospect_id) conditions.push(`prospect_id.eq.${group.prospect_id}`);
      if (group.project_id) conditions.push(`project_id.eq.${group.project_id}`);
      meetingQuery = meetingQuery.or(conditions.join(','));

      const { data: meetings } = await meetingQuery;

      if (meetings && meetings.length > 0) {
        const meetText = meetings.map(m => {
          const date = formatDateTaipei(m.meeting_date);
          let entry = `### ${m.title || '會議'} (${date})`;
          if (m.participants) entry += `\n參與者: ${m.participants}`;
          if (m.summary) entry += `\n摘要: ${m.summary}`;
          if (m.content) entry += `\n內容: ${m.content.substring(0, 500)}`;
          if (m.analysis_result) {
            try {
              const analysis = typeof m.analysis_result === 'string'
                ? JSON.parse(m.analysis_result)
                : m.analysis_result;
              if (analysis.summary) entry += `\nAI分析: ${analysis.summary}`;
              if (analysis.decisions) entry += `\n決議: ${JSON.stringify(analysis.decisions)}`;
            } catch (e) {
              // 忽略解析錯誤
            }
          }
          return entry;
        }).join('\n\n');

        sections.push(`## 會議記錄\n${meetText}`);
      }
    }
  } catch (e) {
    console.error('取得會議記錄失敗:', e.message);
  }

  // --- 4. 取得專案資訊 ---
  try {
    if (group?.project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('client_name, project_name, amount, status, project_type, start_date, notes')
        .eq('id', group.project_id)
        .single();

      if (project) {
        let projText = `客戶: ${project.client_name}\n`;
        projText += `專案: ${project.project_name}\n`;
        projText += `金額: ${project.amount ? `$${Number(project.amount).toLocaleString()}` : '未定'}\n`;
        projText += `狀態: ${project.status || '進行中'}\n`;
        projText += `類型: ${project.project_type || '未分類'}\n`;
        if (project.start_date) projText += `開始日期: ${project.start_date}\n`;
        if (project.notes) projText += `備註: ${project.notes}\n`;

        sections.push(`## 專案資訊\n${projText}`);
      }
    }
  } catch (e) {
    console.error('取得專案資訊失敗:', e.message);
  }

  // --- 5. 取得洽談資訊 ---
  try {
    if (group?.prospect_id) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('client_name, project_name, stage, estimated_amount, decision_maker_name, notes, source')
        .eq('id', group.prospect_id)
        .single();

      if (prospect) {
        let prospText = `客戶: ${prospect.client_name}\n`;
        prospText += `專案: ${prospect.project_name}\n`;
        prospText += `階段: ${prospect.stage || '初談'}\n`;
        prospText += `預估金額: ${prospect.estimated_amount ? `$${Number(prospect.estimated_amount).toLocaleString()}` : '未定'}\n`;
        if (prospect.decision_maker_name) prospText += `決策者: ${prospect.decision_maker_name}\n`;
        if (prospect.source) prospText += `來源: ${prospect.source}\n`;
        if (prospect.notes) prospText += `備註: ${prospect.notes}\n`;

        sections.push(`## 洽談案資訊\n${prospText}`);
      }
    }
  } catch (e) {
    console.error('取得洽談資訊失敗:', e.message);
  }

  // --- 6. 取得 AI 摘要 ---
  try {
    const { data: summaries } = await supabase
      .from('line_conversation_summaries')
      .select('summary, key_topics, action_items, decisions, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (summaries && summaries.length > 0) {
      const sumText = summaries.map(s => {
        const date = formatDateTaipei(s.created_at);
        let entry = `### 摘要 (${date})\n${s.summary}`;
        if (s.key_topics && s.key_topics.length > 0) {
          entry += `\n話題: ${s.key_topics.join('、')}`;
        }
        if (s.decisions && s.decisions.length > 0) {
          entry += `\n決議: ${s.decisions.join('、')}`;
        }
        if (s.action_items && s.action_items.length > 0) {
          const items = s.action_items.map(a =>
            typeof a === 'string' ? a : `${a.task}(${a.assignee || ''})`
          );
          entry += `\n待辦: ${items.join('、')}`;
        }
        return entry;
      }).join('\n\n');

      sections.push(`## AI 對話摘要\n${sumText}`);
    }
  } catch (e) {
    console.error('取得 AI 摘要失敗:', e.message);
  }

  if (sections.length === 0) {
    return '（此群組尚無歷史資料）';
  }

  return sections.join('\n\n---\n\n');
}

/**
 * 呼叫 Claude API 回答問題
 */
async function askClaude(query, contextData) {
  const systemPrompt = `你是川輝AI助理，負責回答關於群組討論歷史的問題。

規則：
1. 只根據提供的資料回答，不要編造
2. 回答時必須標注來源（日期、會議名稱、或訊息時間）
3. 如果找不到答案，回答「在目前的群組記錄中沒有找到相關資訊」
4. 回答簡潔但完整，使用繁體中文
5. 如果是問「上次討論結果」「之前的結論」等，優先從會議記錄中找
6. 回答長度盡量控制在 300 字以內，方便在 LINE 上閱讀`;

  const userContent = `## 群組資料\n\n${contextData}\n\n---\n\n## 使用者提問\n\n${query}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userContent }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API 錯誤: HTTP ${response.status}`);
  }

  const data = await response.json();
  const answer = data.content[0]?.text?.trim();

  if (!answer) {
    throw new Error('Claude 回應為空');
  }

  return answer;
}

/**
 * 格式化時間為台北時區顯示
 */
function formatTimeTaipei(isoString) {
  try {
    return new Date(isoString).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return isoString;
  }
}

/**
 * 格式化日期為台北時區顯示
 */
function formatDateTaipei(isoString) {
  try {
    return new Date(isoString).toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return isoString;
  }
}
