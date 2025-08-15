import { supabase } from '../../../utils/supabaseClient';

export default async function handler(req, res) {
  const { method } = req;
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Activity ID is required' });
  }

  switch (method) {
    case 'GET':
      return handleGet(req, res);
    case 'PATCH':
      return handlePatch(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
      return res.status(405).json({ error: `Method ${method} not allowed` });
  }
}

async function handleGet(req, res) {
  try {
    const { id } = req.query;

    const { data, error } = await supabase
      .from('activities')
      .select(`
        *,
        deal:prospects!deal_id(
          id,
          client_name,
          project_name,
          stage,
          estimated_amount
        ),
        owner:users!owner_id(
          id,
          name,
          role
        )
      `)
      .eq('activity_id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Activity not found' });
      }
      console.error('Error fetching activity:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ activity: data });

  } catch (error) {
    console.error('Error in activity GET:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handlePatch(req, res) {
  try {
    const { id } = req.query;
    const {
      type,
      note,
      due_at,
      done_at,
      result,
      next_follow_up_at
    } = req.body;

    // 準備更新資料
    const updateData = {};
    
    if (type !== undefined) {
      const validTypes = ['phone', 'meet', 'demo', 'quote', 'send', 'visit', 'presentation', 'negotiation', 'contract', 'followup', 'other'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ 
          error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
        });
      }
      updateData.type = type;
    }
    
    if (note !== undefined) updateData.note = note;
    if (due_at !== undefined) updateData.due_at = due_at;
    if (done_at !== undefined) updateData.done_at = done_at;
    
    if (result !== undefined) {
      const validResults = ['next', 'none', 'lost', 'defer', 'completed'];
      if (!validResults.includes(result)) {
        return res.status(400).json({ 
          error: `Invalid result. Must be one of: ${validResults.join(', ')}` 
        });
      }
      updateData.result = result;
    }
    
    if (next_follow_up_at !== undefined) updateData.next_follow_up_at = next_follow_up_at;

    // 如果標記為完成，自動設定 done_at
    if (result === 'completed' && !done_at) {
      updateData.done_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('activities')
      .update(updateData)
      .eq('activity_id', id)
      .select(`
        *,
        deal:prospects!deal_id(
          id,
          client_name,
          project_name,
          stage
        ),
        owner:users!owner_id(
          id,
          name,
          role
        )
      `)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Activity not found' });
      }
      console.error('Error updating activity:', error);
      return res.status(500).json({ error: error.message });
    }

    // 如果設定了下次追蹤日期，更新關聯案件
    if (next_follow_up_at && data.deal_id) {
      await supabase
        .from('prospects')
        .update({ 
          next_followup_date: next_follow_up_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', data.deal_id);
    }

    return res.status(200).json({
      message: 'Activity updated successfully',
      activity: data
    });

  } catch (error) {
    console.error('Error in activity PATCH:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleDelete(req, res) {
  try {
    const { id } = req.query;

    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('activity_id', id);

    if (error) {
      console.error('Error deleting activity:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      message: 'Activity deleted successfully'
    });

  } catch (error) {
    console.error('Error in activity DELETE:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}