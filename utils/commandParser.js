// 自然語言指令解析器
// 使用 Claude AI 解析使用者的自然語言，容錯率高
// 支援各種口語化、不完整、不規則的輸入

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * 用 AI 解析會議相關指令
 * 容錯：接受任何自然語言描述，不要求嚴格格式
 *
 * @param {string} text - 使用者輸入的原始文字
 * @param {string} context - 額外上下文（如群組名稱、最近會議列表）
 * @returns {Object} 解析結果
 */
export async function parseMeetingIntent(text, context = '') {
  if (!ANTHROPIC_API_KEY) {
    console.warn('缺少 ANTHROPIC_API_KEY，無法使用 AI 解析');
    return null;
  }

  // 取得台北時間
  const now = new Date();
  const taipeiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const todayStr = taipeiNow.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' });
  const currentTime = taipeiNow.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

  const systemPrompt = `你是一個指令解析器。根據使用者的自然語言輸入，判斷會議意圖並提取結構化資料。

今天是 ${todayStr}，現在時間 ${currentTime}（台北時間 UTC+8）。

請分析使用者的輸入，回傳以下 JSON（只回傳 JSON，不要其他文字）：

{
  "intent": "create" | "modify" | "cancel" | "query" | "unknown",
  "confidence": 0.0 ~ 1.0,
  "title": "會議標題（如果有提到，否則 null）",
  "date": "YYYY-MM-DD（解析後的日期，根據今天推算相對日期）",
  "start_time": "HH:MM（24小時制）",
  "end_time": "HH:MM（如果有提到，否則 null）",
  "duration_minutes": 60,
  "participants": ["參與者名字"],
  "all_participants": true/false,
  "keyword": "用來搜尋既有會議的關鍵字（修改/取消時用）",
  "changes": {
    "new_date": "YYYY-MM-DD（如果要改日期）",
    "new_start_time": "HH:MM（如果要改時間）",
    "new_end_time": "HH:MM",
    "new_title": "新標題（如果要改標題）",
    "time_shift": "+60 或 -30（分鐘偏移，如延後一小時=+60）"
  },
  "cancel_reason": "取消原因（如果有提到）",
  "raw_interpretation": "你對使用者意圖的簡短中文理解"
}

解析規則：
1. 「明天」= ${getDateStr(taipeiNow, 1)}
2. 「後天」= ${getDateStr(taipeiNow, 2)}
3. 「大後天」= ${getDateStr(taipeiNow, 3)}
4. 「下周X」從下週算，「這周X」從本週算
5. 「下午三點」= 15:00，「早上九點半」= 09:30
6. 「3點」如果沒說上下午，看上下文判斷（上班時間通常指下午）
7. 「所有人」「大家」「全部」→ all_participants = true
8. 如果只說「建個會議 明天三點」，title 用 null，participants 為空陣列
9. 「延後一小時」→ changes.time_shift = +60
10. 「提前半小時」→ changes.time_shift = -30
11. 「取消明天的會議」→ intent=cancel, date 為明天
12. 「把會議改到後天」→ intent=modify, changes.new_date 為後天
13. 如果完全看不懂，intent = "unknown"，confidence = 0
14. 容錯：「禮拜」=「周」=「週」，「號」=「日」，中文數字也要能解析

${context ? `\n額外上下文：\n${context}` : ''}`;

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
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }]
      })
    });

    if (!response.ok) {
      console.error('AI 指令解析失敗:', response.status);
      return null;
    }

    const data = await response.json();
    const responseText = data.content[0].text;

    // 提取 JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('🧠 AI 解析結果:', parsed.intent, parsed.raw_interpretation);
      return parsed;
    }

    return null;
  } catch (error) {
    console.error('AI 指令解析錯誤:', error.message);
    return null;
  }
}

/**
 * 通用 LINE 指令意圖偵測
 * 先用簡單規則快速判斷，判斷不了的才呼叫 AI
 *
 * @param {string} text - 使用者輸入
 * @returns {Object} { type, shouldUseAI }
 */
export function quickDetectIntent(text) {
  if (!text) return { type: 'none', shouldUseAI: false };

  const t = text.trim();

  // ===== 提醒指令（優先判斷，避免被會議邏輯攔截）=====
  if (t.startsWith('/建立提醒') || t.startsWith('/提醒') || t.startsWith('/remind')) {
    return { type: 'create_reminder', shouldUseAI: false };
  }
  if (t.startsWith('/取消提醒') || /取消.*提醒/.test(t)) {
    return { type: 'cancel_reminder', shouldUseAI: false };
  }
  if (t.startsWith('/查看提醒') || t.startsWith('/提醒列表') || /有(哪些|什麼)提醒/.test(t)) {
    return { type: 'list_reminders', shouldUseAI: false };
  }
  if (/^提醒我|^記得|提醒.+(前|點|時)/.test(t)) {
    return { type: 'create_reminder', shouldUseAI: false };
  }

  // 明確的指令前綴 — 直接路由
  if (t.startsWith('/建立會議') || t.startsWith('/會議') || t.startsWith('/meeting')) {
    return { type: 'create_meeting', shouldUseAI: false };
  }
  if (t.startsWith('/修改會議') || t.startsWith('/改會議')) {
    return { type: 'modify_meeting', shouldUseAI: false };
  }
  if (t.startsWith('/取消會議') || t.startsWith('/cancel')) {
    return { type: 'cancel_meeting', shouldUseAI: false };
  }
  if (t.startsWith('/設定') || t.startsWith('/setup')) {
    return { type: 'setup', shouldUseAI: false };
  }
  if (t.includes('綁定Email') || t.includes('綁定email') || t.includes('綁定 Email') || t.startsWith('/綁定')) {
    return { type: 'bind_email', shouldUseAI: false };
  }
  if (t.includes('@川輝') || t.includes('川輝AI') || t.startsWith('/問') || t.startsWith('/ask')) {
    return { type: 'knowledge_query', shouldUseAI: false };
  }
  if ((t.includes('取回') || t.includes('取檔') || t.includes('找檔'))) {
    return { type: 'file_retrieval', shouldUseAI: false };
  }

  // 模糊比對 — 可能是會議相關但沒有明確前綴
  if (/建.*會議|開.*會議|約.*會議|排.*會議|安排.*meeting/i.test(t)) {
    return { type: 'create_meeting', shouldUseAI: true };
  }
  if (/改.*會議|修改.*會議|會議.*改|延後.*會議|提前.*會議|會議.*延後|會議.*提前/i.test(t)) {
    return { type: 'modify_meeting', shouldUseAI: true };
  }
  if (/取消.*會議|會議.*取消|不開.*會議|會議.*不開/i.test(t)) {
    return { type: 'cancel_meeting', shouldUseAI: true };
  }

  return { type: 'none', shouldUseAI: false };
}

/**
 * 將 AI 解析結果轉換為會議指令參數
 */
export function aiResultToMeetingParams(aiResult) {
  if (!aiResult || aiResult.intent === 'unknown' || aiResult.confidence < 0.3) {
    return null;
  }

  const params = {
    intent: aiResult.intent,
    title: aiResult.title,
    participants: aiResult.all_participants ? [{ name: '所有人' }] : (aiResult.participants || []).map(name => ({ name })),
    keyword: aiResult.keyword,
    cancelReason: aiResult.cancel_reason
  };

  // 組合 startTime
  if (aiResult.date && aiResult.start_time) {
    params.startTime = `${aiResult.date}T${aiResult.start_time}:00+08:00`;
  } else if (aiResult.date) {
    params.startTime = `${aiResult.date}T10:00:00+08:00`; // 預設 10:00
  }

  // 組合 endTime
  if (aiResult.date && aiResult.end_time) {
    params.endTime = `${aiResult.date}T${aiResult.end_time}:00+08:00`;
  } else if (params.startTime) {
    // 預設 1 小時
    const start = new Date(params.startTime);
    const durationMs = (aiResult.duration_minutes || 60) * 60 * 1000;
    params.endTime = new Date(start.getTime() + durationMs).toISOString();
  }

  // 修改參數
  if (aiResult.changes) {
    params.changes = {};
    if (aiResult.changes.new_date && aiResult.changes.new_start_time) {
      params.changes.start_time = `${aiResult.changes.new_date}T${aiResult.changes.new_start_time}:00+08:00`;
    } else if (aiResult.changes.new_date) {
      params.changes.start_time = `${aiResult.changes.new_date}T10:00:00+08:00`;
    }
    if (aiResult.changes.new_end_time && aiResult.changes.new_date) {
      params.changes.end_time = `${aiResult.changes.new_date}T${aiResult.changes.new_end_time}:00+08:00`;
    }
    if (aiResult.changes.new_title) {
      params.changes.title = aiResult.changes.new_title;
    }
    if (aiResult.changes.time_shift) {
      params.changes.time_shift_minutes = aiResult.changes.time_shift;
    }
  }

  return params;
}

// Helper: 取得未來 N 天的日期字串
function getDateStr(now, daysAhead) {
  const d = new Date(now);
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}
