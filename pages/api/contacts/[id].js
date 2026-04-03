// Contact Identity Detail API
// GET: Get single contact with related group_participants
// DELETE: Delete contact identity (admin only)

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

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: '缺少聯絡人 ID' });
  }

  // Auth check
  const caller = await verifyUser(req);
  if (!caller) {
    return res.status(401).json({ error: '缺少使用者身份或無效的使用者' });
  }

  // DELETE only admin
  if (req.method === 'DELETE' && caller.role !== 'admin') {
    return res.status(403).json({ error: '只有管理員可以刪除聯絡人' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, id);
    case 'DELETE':
      return handleDelete(req, res, id);
    default:
      res.setHeader('Allow', ['GET', 'DELETE']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
}

async function handleGet(req, res, id) {
  try {
    // Get the contact identity
    const { data: contact, error: contactError } = await supabase
      .from('contact_identities')
      .select('*')
      .eq('id', id)
      .single();

    if (contactError) {
      if (contactError.code === 'PGRST116') {
        return res.status(404).json({ error: '找不到聯絡人' });
      }
      throw contactError;
    }

    // Get related group participations
    let participants = [];
    try {
      const { data: participantData, error: participantError } = await supabase
        .from('group_participants')
        .select(`
          *,
          line_group:line_groups!group_participants_line_group_id_fkey(
            group_id,
            group_name,
            group_type
          )
        `)
        .eq('identity_id', id)
        .order('created_at', { ascending: false });

      if (!participantError) {
        participants = participantData || [];
      }
    } catch (e) {
      // If the join fails, try without it
      const { data: participantData } = await supabase
        .from('group_participants')
        .select('*')
        .eq('identity_id', id)
        .order('created_at', { ascending: false });
      participants = participantData || [];
    }

    // Get linked internal user if exists
    let internalUser = null;
    if (contact.internal_user_id) {
      const { data: userData } = await supabase
        .from('users')
        .select('id, name, email, role')
        .eq('id', contact.internal_user_id)
        .single();
      internalUser = userData;
    }

    return res.status(200).json({
      data: {
        ...contact,
        internal_user: internalUser,
        group_participations: participants
      }
    });
  } catch (error) {
    console.error('Error in GET /api/contacts/[id]:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch contact' });
  }
}

async function handleDelete(req, res, id) {
  try {
    // Check if contact exists
    const { data: existing, error: checkError } = await supabase
      .from('contact_identities')
      .select('id, display_name')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({ error: '找不到聯絡人' });
    }

    // Delete the contact (group_participants will cascade delete)
    const { error: deleteError } = await supabase
      .from('contact_identities')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    return res.status(200).json({
      message: `已刪除聯絡人：${existing.display_name || existing.id}`
    });
  } catch (error) {
    console.error('Error in DELETE /api/contacts/[id]:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete contact' });
  }
}
