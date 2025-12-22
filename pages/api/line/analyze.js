// LINE 對話 AI 分析 API
// 分析群組對話，產生摘要並建議洽談階段

import { supabase } from '../../../utils/supabaseClient';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { group_id, period = 'recent' } = req.body;

  if (!group_id) {
    return res.status(400).json({ error: '請提供 group_id' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: '缺少 ANTHROPIC_API_KEY' });
  }

  try {
    // 取得群組資訊
    const { data: group, error: groupError } = await supabase
      .from('line_groups')
      .select(`
        *,
        prospects:prospect_id(id, client_name, project_name, stage, decision_maker_name)
      `)
      .eq('group_id', group_id)
      .single();

    if (groupError || !group) {
      console.error('找不到群組:', group_id, groupError);
      return res.status(404).json({
        error: '找不到群組',
        details: `群組 ID: ${group_id}`,
        hint: '請確認 LINE Bot 已連接並有訊息紀錄'
      });
    }

    // 取得最近的訊息
    let query = supabase
      .from('line_messages')
      .select('*')
      .eq('group_id', group_id)
      .order('timestamp', { ascending: true });

    // 根據期間篩選
    if (period === 'recent') {
      // 最近 50 則訊息
      query = query.limit(50);
    } else if (period === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query = query.gte('timestamp', today.toISOString());
    } else if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query = query.gte('timestamp', weekAgo.toISOString());
    }

    const { data: messages, error: msgError } = await query;

    if (msgError) {
      throw msgError;
    }

    if (!messages || messages.length === 0) {
      return res.status(200).json({
        success: true,
        analysis: {
          summary: '此期間沒有對話紀錄',
          message_count: 0
        }
      });
    }

    // 格式化對話紀錄
    const conversationText = messages.map(msg => {
      const time = new Date(msg.timestamp).toLocaleString('zh-TW');
      const sender = `${msg.sender_name} (${msg.sender_type === 'staff' ? '員工' : '客戶'})`;
      const content = msg.content || `[${msg.message_type}]`;
      return `[${time}] ${sender}: ${content}`;
    }).join('\n');

    // AI 分析
    const analysis = await analyzeConversation({
      conversationText,
      group,
      messageCount: messages.length
    });

    // 儲存分析結果
    const summaryData = {
      group_id: group_id,
      prospect_id: group.prospect_id,
      period_type: period,
      period_start: messages[0]?.timestamp,
      period_end: messages[messages.length - 1]?.timestamp,
      message_count: messages.length,
      summary: analysis.summary,
      key_topics: analysis.key_topics,
      action_items: analysis.action_items,
      decisions: analysis.decisions,
      client_concerns: analysis.client_concerns,
      ai_stage_suggestion: analysis.stage_suggestion,
      ai_stage_confidence: analysis.stage_confidence,
      ai_stage_reason: analysis.stage_reason,
      overall_sentiment: analysis.sentiment,
      risk_alerts: analysis.risk_alerts
    };

    const { error: saveError } = await supabase
      .from('line_conversation_summaries')
      .insert([summaryData]);

    if (saveError) {
      console.error('儲存摘要失敗:', saveError);
    }

    // 標記訊息為已分析
    await supabase
      .from('line_messages')
      .update({ ai_processed: true })
      .eq('group_id', group_id)
      .in('id', messages.map(m => m.id));

    return res.status(200).json({
      success: true,
      analysis: {
        ...analysis,
        message_count: messages.length,
        period_start: messages[0]?.timestamp,
        period_end: messages[messages.length - 1]?.timestamp
      }
    });

  } catch (error) {
    console.error('LINE 分析錯誤:', error);
    return res.status(500).json({ error: '分析失敗', details: error.message });
  }
}

async function analyzeConversation({ conversationText, group, messageCount }) {
  const prospect = group.prospects;
  const currentStage = prospect?.stage || '未綁定';

  const systemPrompt = `你是川輝科技的 AI 業務助理。你的任務是分析 LINE 群組對話，提取重要資訊，並評估洽談進度。

請用繁體中文回應，以 JSON 格式輸出分析結果。`;

  const userPrompt = `請分析以下 LINE 群組對話：

【群組資訊】
群組名稱: ${group.group_name}
${prospect ? `綁定客戶: ${prospect.client_name}
專案名稱: ${prospect.project_name}
目前階段: ${currentStage}
決策者: ${prospect.decision_maker_name || '未知'}` : '(尚未綁定洽談案)'}

【對話紀錄】(共 ${messageCount} 則訊息)
${conversationText}

---

請分析並回傳 JSON 格式（只回傳 JSON，不要其他文字）：

{
  "summary": "對話摘要 (100-200字，重點整理)",
  "key_topics": ["主要討論話題1", "話題2", "話題3"],
  "action_items": [
    {"task": "待辦事項", "assignee": "我方/客戶", "urgency": "high/medium/low"}
  ],
  "decisions": ["決議事項1", "決議事項2"],
  "client_concerns": ["客戶顧慮或疑問1", "顧慮2"],
  "client_requirements": ["客戶提到的需求1", "需求2"],

  "stage_suggestion": "建議的洽談階段 (初談/提案/報價/談判/待簽約/已失單)",
  "stage_confidence": 0.0-1.0,
  "stage_reason": "為什麼建議這個階段",

  "sentiment": "positive/neutral/negative",
  "sentiment_indicators": ["情緒判斷依據1", "依據2"],

  "close_probability": "high/medium/low",
  "close_signals": ["成交訊號1", "訊號2"],

  "risk_alerts": [
    {"type": "risk類型", "description": "描述", "severity": "high/medium/low"}
  ],

  "recommended_actions": ["建議的下一步行動1", "行動2"],
  "talking_points": ["下次溝通可以提到的點1", "點2"]
}`;

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

  // 解析 JSON
  try {
    return JSON.parse(responseText);
  } catch (e) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('無法解析 AI 回應');
  }
}
