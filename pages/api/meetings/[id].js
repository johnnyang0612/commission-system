// 單一會議紀錄 API - GET/PUT/DELETE
import { supabase } from '../../../utils/supabaseClient';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: '缺少會議紀錄 ID' });
  }

  switch (req.method) {
    case 'GET':
      return getMeeting(req, res, id);
    case 'PUT':
      return updateMeeting(req, res, id);
    case 'DELETE':
      return deleteMeeting(req, res, id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// 取得單一會議紀錄
async function getMeeting(req, res, id) {
  try {
    const { data, error } = await supabase
      .from('meeting_records')
      .select(`
        *,
        prospects:prospect_id(id, client_name, project_name, stage),
        projects:project_id(id, client_name, project_name),
        users:user_id(id, name, email)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '找不到會議紀錄' });
      }
      throw error;
    }

    return res.status(200).json({ data });
  } catch (error) {
    console.error('取得會議紀錄錯誤:', error);
    return res.status(500).json({ error: '取得會議紀錄失敗', details: error.message });
  }
}

// 更新會議紀錄
async function updateMeeting(req, res, id) {
  const updates = req.body;

  try {
    const { data, error } = await supabase
      .from('meeting_records')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: '找不到會議紀錄' });
      }
      throw error;
    }

    return res.status(200).json({ data });
  } catch (error) {
    console.error('更新會議紀錄錯誤:', error);
    return res.status(500).json({ error: '更新會議紀錄失敗', details: error.message });
  }
}

// 刪除會議紀錄
async function deleteMeeting(req, res, id) {
  try {
    const { error } = await supabase
      .from('meeting_records')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return res.status(200).json({ success: true, message: '會議紀錄已刪除' });
  } catch (error) {
    console.error('刪除會議紀錄錯誤:', error);
    return res.status(500).json({ error: '刪除會議紀錄失敗', details: error.message });
  }
}
