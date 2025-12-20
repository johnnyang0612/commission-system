// 會議紀錄 CRUD API
import { supabase } from '../../../utils/supabaseClient';

export default async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      return getMeetings(req, res);
    case 'POST':
      return createMeeting(req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// 取得會議紀錄列表
async function getMeetings(req, res) {
  const { prospect_id, project_id, user_id, limit = 50 } = req.query;

  try {
    let query = supabase
      .from('meeting_records')
      .select(`
        *,
        prospects:prospect_id(id, client_name, project_name, stage),
        projects:project_id(id, client_name, project_name),
        users:user_id(id, name, email)
      `)
      .order('meeting_date', { ascending: false })
      .limit(parseInt(limit));

    if (prospect_id) {
      query = query.eq('prospect_id', prospect_id);
    }
    if (project_id) {
      query = query.eq('project_id', project_id);
    }
    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('取得會議紀錄錯誤:', error);
      return res.status(500).json({ error: '取得會議紀錄失敗', details: error.message });
    }

    return res.status(200).json({ data });
  } catch (error) {
    console.error('取得會議紀錄錯誤:', error);
    return res.status(500).json({ error: '取得會議紀錄失敗', details: error.message });
  }
}

// 新增會議紀錄
async function createMeeting(req, res) {
  const {
    prospect_id,
    project_id,
    user_id,
    title,
    meeting_date,
    duration_minutes,
    meeting_url,
    participants,
    raw_content,
    transcript,
    summary,
    action_items,
    key_points,
    // AI 分析結果
    ai_matched_prospect_id,
    ai_match_confidence,
    ai_match_reason,
    ai_stage_suggestion,
    ai_sentiment,
    ai_close_probability,
    ai_next_steps,
    ai_client_concerns,
    ai_decisions,
    // 其他
    source = 'manual',
    source_file_name,
    status = 'analyzed'
  } = req.body;

  if (!title || !meeting_date) {
    return res.status(400).json({
      error: '請提供會議標題和日期',
      required: ['title', 'meeting_date']
    });
  }

  try {
    const { data, error } = await supabase
      .from('meeting_records')
      .insert([{
        prospect_id: prospect_id || ai_matched_prospect_id,
        project_id,
        user_id,
        title,
        meeting_date,
        duration_minutes,
        meeting_url,
        participants,
        raw_content,
        transcript,
        summary,
        action_items,
        key_points,
        ai_matched_prospect_id,
        ai_match_confidence,
        ai_match_reason,
        ai_stage_suggestion,
        ai_sentiment,
        ai_close_probability,
        ai_next_steps,
        ai_client_concerns,
        ai_decisions,
        source,
        source_file_name,
        status
      }])
      .select()
      .single();

    if (error) {
      console.error('新增會議紀錄錯誤:', error);
      return res.status(500).json({ error: '新增會議紀錄失敗', details: error.message });
    }

    return res.status(201).json({ data });
  } catch (error) {
    console.error('新增會議紀錄錯誤:', error);
    return res.status(500).json({ error: '新增會議紀錄失敗', details: error.message });
  }
}
