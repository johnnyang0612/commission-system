// Contact Bind API
// POST: Bind a LINE user to a contact identity or internal user

import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';

export default async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase client not initialized' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const {
      lineUserId,
      identityId,
      userId,
      email,
      identityType,
      displayName,
      realName,
      company,
      phone,
      callerId // The user performing this action
    } = req.body;

    // Auth check: verify caller
    const callerUserId = callerId || userId;
    if (!callerUserId) {
      return res.status(401).json({ error: '缺少使用者身份' });
    }
    const { data: caller } = await supabase.from('users').select('id, role').eq('id', callerUserId).single();
    if (!caller) {
      return res.status(401).json({ error: '無效的使用者' });
    }

    // Binding others requires admin/leader/pm role
    if (userId && userId !== callerUserId && !['admin', 'leader', 'pm'].includes(caller.role)) {
      return res.status(403).json({ error: '只有管理員、主管或 PM 可以綁定其他使用者' });
    }

    if (!lineUserId && !identityId) {
      return res.status(400).json({ error: '需要提供 lineUserId 或 identityId' });
    }

    let identity = null;

    // If identityId is provided, update the existing contact
    if (identityId) {
      const updateData = {
        updated_at: new Date().toISOString()
      };

      if (lineUserId) updateData.line_user_id = lineUserId;
      if (userId) updateData.internal_user_id = userId;
      if (identityType) updateData.identity_type = identityType;
      if (email) updateData.email = email;
      if (displayName) updateData.display_name = displayName;
      if (realName) updateData.real_name = realName;
      if (company) updateData.company = company;
      if (phone) updateData.phone = phone;

      const { data, error } = await supabase
        .from('contact_identities')
        .update(updateData)
        .eq('id', identityId)
        .select()
        .single();

      if (error) throw error;
      identity = data;
    }
    // If lineUserId provided, check if identity exists or create one
    else if (lineUserId) {
      // Check for existing identity with this LINE user ID
      const { data: existing } = await supabase
        .from('contact_identities')
        .select('*')
        .eq('line_user_id', lineUserId)
        .single();

      if (existing) {
        // Update existing identity
        const updateData = {
          updated_at: new Date().toISOString()
        };

        if (userId) updateData.internal_user_id = userId;
        if (identityType) updateData.identity_type = identityType;
        if (email) updateData.email = email;
        if (displayName) updateData.display_name = displayName;
        if (realName) updateData.real_name = realName;
        if (company) updateData.company = company;
        if (phone) updateData.phone = phone;

        const { data, error } = await supabase
          .from('contact_identities')
          .update(updateData)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        identity = data;
      } else {
        // Create new identity
        const insertData = {
          line_user_id: lineUserId,
          display_name: displayName || null,
          real_name: realName || null,
          identity_type: identityType || 'unknown',
          company: company || null,
          email: email || null,
          phone: phone || null,
          internal_user_id: userId || null,
          is_manually_verified: false,
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('contact_identities')
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        identity = data;
      }
    }

    // If userId is provided and identity type is employee, fetch user info
    if (userId && identity) {
      const { data: userData } = await supabase
        .from('users')
        .select('id, name, email, role')
        .eq('id', userId)
        .single();

      if (userData) {
        // Auto-fill name and email from user record if not set
        const autoUpdate = {};
        if (!identity.real_name && userData.name) autoUpdate.real_name = userData.name;
        if (!identity.email && userData.email) autoUpdate.email = userData.email;
        if (!identity.identity_type || identity.identity_type === 'unknown') {
          autoUpdate.identity_type = 'employee';
        }

        if (Object.keys(autoUpdate).length > 0) {
          autoUpdate.updated_at = new Date().toISOString();
          const { data: updated } = await supabase
            .from('contact_identities')
            .update(autoUpdate)
            .eq('id', identity.id)
            .select()
            .single();

          if (updated) identity = updated;
        }
      }
    }

    return res.status(200).json({ data: identity });
  } catch (error) {
    console.error('Error in POST /api/contacts/bind:', error);
    return res.status(500).json({ error: error.message || 'Failed to bind contact' });
  }
}
