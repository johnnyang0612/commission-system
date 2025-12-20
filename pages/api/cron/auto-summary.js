// 自動摘要 Cron Job
// 每天自動為活躍群組產生摘要

import { supabase } from '../../../utils/supabaseClient';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  const cronSecret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const results = { processed: 0, summaries: 0, errors: [] };

    // 取得過去 24 小時有新訊息的群組
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: activeGroups } = await supabase
      .from('line_groups')
      .select('group_id, group_name, prospect_id, project_id')
      .gt('last_message_at', yesterday)
      .gte('message_count', 5); // 至少 5 則訊息

    results.processed = activeGroups?.length || 0;

    for (const group of activeGroups || []) {
      try {
        // 取得最近訊息
        const { data: messages } = await supabase
          .from('line_messages')
          .select('sender_name, sender_type, message_type, content, timestamp')
          .eq('group_id', group.group_id)
          .gt('timestamp', yesterday)
          .order('timestamp', { ascending: true })
          .limit(100);

        if (!messages || messages.length < 3) continue;

        // 格式化對話
        const conversation = messages
          .filter(m => m.message_type === 'text' && m.content)
          .map(m => `[${m.sender_name}${m.sender_type === 'staff' ? '(員工)' : ''}]: ${m.content}`)
          .join('\n');

        if (conversation.length < 100) continue;

        // AI 摘要
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `分析以下業務對話，產生摘要報告。

群組: ${group.group_name}
對話內容:
"""
${conversation.substring(0, 8000)}
"""

請用 JSON 格式回傳:
{
  "summary": "對話摘要 (200字內)",
  "key_topics": ["主要話題1", "主要話題2"],
  "action_items": ["待辦事項1", "待辦事項2"],
  "client_concerns": ["客戶顧慮1"],
  "overall_sentiment": "positive/neutral/negative",
  "stage_suggestion": "建議的洽談階段"
}

只回傳 JSON。`
          }]
        });

        const content = response.content[0].text;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const analysis = JSON.parse(jsonMatch[0]);

        // 儲存摘要
        await supabase.from('line_conversation_summaries').insert({
          group_id: group.group_id,
          prospect_id: group.prospect_id,
          period_type: 'daily',
          period_start: yesterday,
          period_end: new Date().toISOString(),
          message_count: messages.length,
          summary: analysis.summary,
          key_topics: analysis.key_topics,
          action_items: analysis.action_items,
          client_concerns: analysis.client_concerns,
          overall_sentiment: analysis.overall_sentiment,
          ai_stage_suggestion: analysis.stage_suggestion
        });

        results.summaries++;
      } catch (e) {
        console.error('群組摘要失敗:', group.group_id, e);
        results.errors.push({ group_id: group.group_id, error: e.message });
      }
    }

    return res.status(200).json({ success: true, ...results });

  } catch (error) {
    console.error('Auto-summary cron 錯誤:', error);
    return res.status(500).json({ error: error.message });
  }
}
