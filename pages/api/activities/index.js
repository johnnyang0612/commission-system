import { supabase } from '../../../utils/supabaseClient';

export default async function handler(req, res) {
  const { method } = req;

  switch (method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: `Method ${method} not allowed` });
  }
}

async function handleGet(req, res) {
  try {
    const { 
      owner, 
      status, 
      deal_id, 
      type, 
      limit = 50, 
      offset = 0 
    } = req.query;

    let query = supabase
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
      .order('due_at', { ascending: true });

    // 篩選條件
    if (owner) {
      if (owner === 'me') {
        // 這裡需要從認證中獲取當前用戶ID
        // 簡化處理，實際應該從JWT token獲取
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          query = query.eq('owner_id', user.id);
        }
      } else {
        query = query.eq('owner_id', owner);
      }
    }

    if (status) {
      if (status === 'open') {
        query = query.is('done_at', null);
      } else if (status === 'completed') {
        query = query.not('done_at', 'is', null);
      }
    }

    if (deal_id) {
      query = query.eq('deal_id', deal_id);
    }

    if (type) {
      query = query.eq('type', type);
    }

    // 分頁
    if (limit && offset) {
      query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching activities:', error);
      return res.status(500).json({ error: error.message });
    }

    // 按照 PRD 要求分組任務
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const groupedActivities = {
      overdue: [],
      today: [],
      soon: [], // 7天內
      unscheduled: []
    };

    data.forEach(activity => {
      if (!activity.due_at) {
        groupedActivities.unscheduled.push(activity);
      } else {
        const dueDate = new Date(activity.due_at);
        if (dueDate < today) {
          groupedActivities.overdue.push(activity);
        } else if (dueDate.getTime() === today.getTime()) {
          groupedActivities.today.push(activity);
        } else if (dueDate <= sevenDaysLater) {
          groupedActivities.soon.push(activity);
        }
      }
    });

    return res.status(200).json({
      activities: data,
      grouped: groupedActivities,
      total: data.length
    });

  } catch (error) {
    console.error('Error in activities GET:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handlePost(req, res) {
  try {
    const {
      deal_id,
      owner_id,
      type,
      note,
      due_at,
      next_follow_up_at
    } = req.body;

    // 驗證必填欄位
    if (!deal_id || !owner_id || !type) {
      return res.status(400).json({ 
        error: 'Missing required fields: deal_id, owner_id, type' 
      });
    }

    // 驗證 type 值
    const validTypes = ['phone', 'meet', 'demo', 'quote', 'send', 'visit', 'presentation', 'negotiation', 'contract', 'followup', 'other'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}` 
      });
    }

    const { data, error } = await supabase
      .from('activities')
      .insert([{
        deal_id,
        owner_id,
        type,
        note,
        due_at,
        next_follow_up_at
      }])
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
      console.error('Error creating activity:', error);
      return res.status(500).json({ error: error.message });
    }

    // 如果設定了下次追蹤日期，更新案件的 next_followup_date
    if (next_follow_up_at && deal_id) {
      await supabase
        .from('prospects')
        .update({ 
          next_followup_date: next_follow_up_at,
          updated_at: new Date().toISOString()
        })
        .eq('id', deal_id);
    }

    return res.status(201).json({
      message: 'Activity created successfully',
      activity: data[0]
    });

  } catch (error) {
    console.error('Error in activities POST:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}