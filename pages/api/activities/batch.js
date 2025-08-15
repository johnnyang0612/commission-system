import { supabase } from '../../../utils/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      activity_ids,
      action,
      data: updateData
    } = req.body;

    if (!activity_ids || !Array.isArray(activity_ids) || activity_ids.length === 0) {
      return res.status(400).json({ error: 'activity_ids array is required' });
    }

    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    let updates = {};

    switch (action) {
      case 'reschedule':
        if (!updateData.due_at) {
          return res.status(400).json({ error: 'due_at is required for reschedule action' });
        }
        updates.due_at = updateData.due_at;
        break;

      case 'assign':
        if (!updateData.owner_id) {
          return res.status(400).json({ error: 'owner_id is required for assign action' });
        }
        updates.owner_id = updateData.owner_id;
        break;

      case 'complete':
        updates.done_at = new Date().toISOString();
        updates.result = 'completed';
        break;

      case 'defer':
        updates.result = 'defer';
        if (updateData.due_at) {
          updates.due_at = updateData.due_at;
        }
        break;

      case 'set_result':
        if (!updateData.result) {
          return res.status(400).json({ error: 'result is required for set_result action' });
        }
        const validResults = ['next', 'none', 'lost', 'defer', 'completed'];
        if (!validResults.includes(updateData.result)) {
          return res.status(400).json({ 
            error: `Invalid result. Must be one of: ${validResults.join(', ')}` 
          });
        }
        updates.result = updateData.result;
        if (updateData.result === 'completed') {
          updates.done_at = new Date().toISOString();
        }
        break;

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    // 執行批次更新
    const { data, error } = await supabase
      .from('activities')
      .update(updates)
      .in('activity_id', activity_ids)
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
      `);

    if (error) {
      console.error('Error in batch update:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      message: `Successfully updated ${data.length} activities`,
      activities: data,
      action: action
    });

  } catch (error) {
    console.error('Error in activities batch operation:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}