// Contact Identity API
// GET: List contacts with filters
// POST: Create new contact identity
// PUT: Update contact identity

import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';

// Auth helper: verify caller is a real user
async function verifyUser(req) {
  const userId = req.body?.userId || req.query?.userId;
  if (!userId) return null;
  const { data } = await supabase.from('users').select('id, role').eq('id', userId).single();
  return data || null;
}

export default async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not initialized' });
  }

  // Auth check for all methods
  const caller = await verifyUser(req);
  if (!caller) {
    return res.status(401).json({ error: '缺少使用者身份或無效的使用者' });
  }

  // Role check: only admin/finance/leader can write
  if ((req.method === 'POST' || req.method === 'PUT') &&
      !['admin', 'finance', 'leader'].includes(caller.role)) {
    return res.status(403).json({ error: '無權限執行此操作' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    case 'PUT':
      return handlePut(req, res);
    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
}

async function handleGet(req, res) {
  try {
    const {
      identity_type,
      search,
      verified,
      limit = 100,
      offset = 0
    } = req.query;

    let query = supabase
      .from('contact_identities')
      .select(`
        *,
        internal_user:users!contact_identities_internal_user_id_fkey(id, name, email, role)
      `, { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Filter by identity type
    if (identity_type && identity_type !== 'all') {
      query = query.eq('identity_type', identity_type);
    }

    // Filter by verified status
    if (verified === 'true') {
      query = query.eq('is_manually_verified', true);
    } else if (verified === 'false') {
      query = query.eq('is_manually_verified', false);
    }

    // Search by name, email, company
    if (search) {
      query = query.or(
        `display_name.ilike.%${search}%,real_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching contacts:', error);
      // Fallback: try without the join if the FK relationship fails
      if (error.message && error.message.includes('contact_identities_internal_user_id_fkey')) {
        const fallbackQuery = supabase
          .from('contact_identities')
          .select('*', { count: 'exact' })
          .order('updated_at', { ascending: false })
          .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (identity_type && identity_type !== 'all') {
          fallbackQuery.eq('identity_type', identity_type);
        }
        if (verified === 'true') {
          fallbackQuery.eq('is_manually_verified', true);
        } else if (verified === 'false') {
          fallbackQuery.eq('is_manually_verified', false);
        }
        if (search) {
          fallbackQuery.or(
            `display_name.ilike.%${search}%,real_name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`
          );
        }

        const fallbackResult = await fallbackQuery;
        if (fallbackResult.error) throw fallbackResult.error;
        return res.status(200).json({
          data: fallbackResult.data || [],
          count: fallbackResult.count || 0
        });
      }
      throw error;
    }

    return res.status(200).json({ data: data || [], count: count || 0 });
  } catch (error) {
    console.error('Error in GET /api/contacts:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch contacts' });
  }
}

async function handlePost(req, res) {
  try {
    const {
      line_user_id,
      display_name,
      real_name,
      identity_type = 'unknown',
      company,
      email,
      phone,
      internal_user_id,
      tags,
      notes,
      is_manually_verified = false
    } = req.body;

    if (!display_name && !real_name && !email) {
      return res.status(400).json({ error: '至少需要提供顯示名稱、真實姓名或 Email' });
    }

    const insertData = {
      display_name: display_name || null,
      real_name: real_name || null,
      identity_type,
      company: company || null,
      email: email || null,
      phone: phone || null,
      internal_user_id: internal_user_id || null,
      tags: tags || null,
      notes: notes || null,
      is_manually_verified,
      updated_at: new Date().toISOString()
    };

    if (line_user_id) {
      insertData.line_user_id = line_user_id;
    }

    const { data, error } = await supabase
      .from('contact_identities')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ data });
  } catch (error) {
    console.error('Error in POST /api/contacts:', error);
    return res.status(500).json({ error: error.message || 'Failed to create contact' });
  }
}

async function handlePut(req, res) {
  try {
    const { id, ...updateFields } = req.body;

    if (!id) {
      return res.status(400).json({ error: '缺少聯絡人 ID' });
    }

    // Only allow updating specific fields
    const allowedFields = [
      'display_name', 'real_name', 'identity_type', 'company',
      'email', 'phone', 'internal_user_id', 'tags', 'notes',
      'is_manually_verified', 'line_user_id'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (field in updateFields) {
        updateData[field] = updateFields[field];
      }
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('contact_identities')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ data });
  } catch (error) {
    console.error('Error in PUT /api/contacts:', error);
    return res.status(500).json({ error: error.message || 'Failed to update contact' });
  }
}
