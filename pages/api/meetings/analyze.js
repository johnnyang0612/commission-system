// 會議紀錄 AI 分析 API
// 分析會議內容，自動配對洽談案，提取重點和行動項目

import { supabase } from '../../../utils/supabaseClient';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    content,           // 會議紀錄內容 (從 Seameet 貼上)
    meeting_title,     // 會議標題 (可選)
    meeting_date,      // 會議日期 (可選)
    participants,      // 參與者 (可選)
  } = req.body;

  if (!content) {
    return res.status(400).json({
      error: '請提供會議紀錄內容',
      required: ['content']
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: '缺少 Anthropic API Key',
      hint: '請在 .env.local 中設定 ANTHROPIC_API_KEY'
    });
  }

  try {
    // ===== STEP 1: 取得現有洽談案列表 =====
    const { data: prospects, error: prospectsError } = await supabase
      .from('prospects')
      .select('id, client_name, project_name, stage, decision_maker_name, decision_maker_contact, owner_id, users:owner_id(name)')
      .in('stage', ['初談', '提案', '報價', '談判', '待簽約']);

    if (prospectsError) {
      console.error('取得洽談案錯誤:', prospectsError);
    }

    // 也取得專案列表 (已簽約的客戶)
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, client_name, project_name, assigned_to, users:assigned_to(name)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (projectsError) {
      console.error('取得專案錯誤:', projectsError);
    }

    // ===== STEP 2: 呼叫 Claude 分析 =====
    const analysis = await analyzeMeetingWithClaude({
      content,
      meeting_title,
      meeting_date,
      participants,
      prospects: prospects || [],
      projects: projects || []
    });

    // ===== STEP 3: 回傳分析結果 =====
    return res.status(200).json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('會議分析錯誤:', error);
    return res.status(500).json({
      error: '分析失敗',
      details: error.message
    });
  }
}

// 使用 Claude 分析會議內容
async function analyzeMeetingWithClaude({ content, meeting_title, meeting_date, participants, prospects, projects }) {
  const systemPrompt = `你是川輝科技的 AI 會議助理。你的任務是分析會議紀錄，提取重要資訊，並自動配對到正確的客戶/洽談案。

你需要：
1. 從會議內容中識別客戶公司名稱、聯絡人
2. 配對到現有的洽談案或專案
3. 提取會議摘要、重點、行動項目
4. 分析客戶情緒和成交可能性
5. 建議洽談階段

請用繁體中文回應，並以 JSON 格式輸出。`;

  const prospectsInfo = prospects.length > 0
    ? prospects.map(p => `- ID: ${p.id} | ${p.client_name} / ${p.project_name} (${p.stage}) | 決策者: ${p.decision_maker_name || '未知'} | 業務: ${p.users?.name || '未指定'}`).join('\n')
    : '(目前沒有進行中的洽談案)';

  const projectsInfo = projects.length > 0
    ? projects.map(p => `- ID: ${p.id} | ${p.client_name} / ${p.project_name} | 業務: ${p.users?.name || '未指定'}`).join('\n')
    : '(目前沒有專案)';

  const userPrompt = `請分析以下會議紀錄：

${meeting_title ? `【會議標題】${meeting_title}` : ''}
${meeting_date ? `【會議日期】${meeting_date}` : ''}
${participants ? `【參與者】${participants}` : ''}

【會議內容】
${content}

---

【現有洽談案】
${prospectsInfo}

【現有專案】
${projectsInfo}

---

請分析並回傳 JSON 格式（只回傳 JSON，不要其他文字）：

{
  "matched_type": "prospect 或 project 或 new",
  "matched_id": "配對到的 ID，如果是新客戶填 null",
  "matched_name": "配對到的客戶/專案名稱",
  "match_confidence": 0.0-1.0 的信心度,
  "match_reason": "為什麼配對到這個案件，或為什麼判斷是新客戶",

  "is_new_client": true/false,
  "new_client_info": {
    "company_name": "如果是新客戶，填公司名稱",
    "contact_name": "聯絡人姓名",
    "contact_title": "職稱",
    "contact_info": "電話或 email"
  },

  "summary": "會議摘要 (100-200字)",
  "key_points": ["重點1", "重點2", "重點3"],
  "action_items": [
    {
      "task": "待辦事項描述",
      "assignee": "負責人 (我方/客戶/待定)",
      "due_date": "期限 (如有提到)",
      "priority": "high/medium/low"
    }
  ],
  "decisions": ["會議決議1", "會議決議2"],
  "client_concerns": ["客戶顧慮1", "客戶顧慮2"],
  "client_requirements": ["客戶需求1", "客戶需求2"],

  "stage_suggestion": "初談/提案/報價/談判/待簽約",
  "stage_reason": "為什麼建議這個階段",

  "sentiment": "positive/neutral/negative",
  "sentiment_reason": "情緒判斷原因",

  "close_probability": "high/medium/low",
  "close_probability_reason": "成交機率判斷原因",

  "next_steps": "建議的下一步行動",
  "risk_alerts": ["風險提醒1", "風險提醒2"] 或 []
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
    // 嘗試直接解析
    return JSON.parse(responseText);
  } catch (e) {
    // 如果失敗，嘗試提取 JSON 部分
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('無法解析 AI 回應');
  }
}
