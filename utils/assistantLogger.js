import { supabaseAdmin as supabase } from './supabaseAdmin';

/**
 * Log an assistant command/action for audit trail
 *
 * @param {Object} params
 * @param {string|null} params.actorUserId - Internal system user ID
 * @param {string|null} params.actorIdentityId - contact_identities ID
 * @param {string} params.channel - line_group, line_private, web_chat, system
 * @param {string|null} params.sourceGroupId - LINE group ID
 * @param {string} params.commandType - bind_email, create_meeting, query, generate_doc, etc.
 * @param {string|null} params.rawInput - Original user input text
 * @param {Object|null} params.parsedIntent - Parsed intent JSON
 * @param {Object|null} params.executionPlan - Execution plan JSON
 * @param {string} params.resultStatus - pending, executing, success, failed, cancelled
 * @param {Object|null} params.resultData - Result data JSON
 * @param {string|null} params.errorMessage - Error message if failed
 * @returns {Promise<string|null>} Command log ID or null
 */
export async function logAssistantAction({
  actorUserId = null,
  actorIdentityId = null,
  channel = 'system',
  sourceGroupId = null,
  commandType,
  rawInput = null,
  parsedIntent = null,
  executionPlan = null,
  resultStatus = 'pending',
  resultData = null,
  errorMessage = null
}) {
  try {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('assistant_commands')
      .insert([{
        actor_user_id: actorUserId,
        actor_identity_id: actorIdentityId,
        channel,
        source_group_id: sourceGroupId,
        command_type: commandType,
        raw_input: rawInput,
        parsed_intent: parsedIntent,
        execution_plan: executionPlan,
        result_status: resultStatus,
        result_data: resultData,
        error_message: errorMessage,
        completed_at: resultStatus === 'success' || resultStatus === 'failed'
          ? new Date().toISOString() : null
      }])
      .select()
      .single();

    if (error) {
      console.error('助理指令記錄失敗:', error.message);
      return null;
    }

    return data?.id || null;
  } catch (e) {
    console.error('助理指令記錄異常:', e.message);
    return null;
  }
}

/**
 * Update an existing command log (e.g., when execution completes)
 *
 * @param {string} commandId - The command log ID to update
 * @param {Object} updates - Fields to update
 */
export async function updateAssistantAction(commandId, updates) {
  try {
    if (!supabase || !commandId) return;

    const updateData = { ...updates };

    // Auto-set completed_at for terminal statuses
    if (updates.resultStatus === 'success' || updates.resultStatus === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    // Map camelCase to snake_case for DB columns
    const dbUpdates = {};
    if (updateData.resultStatus !== undefined) dbUpdates.result_status = updateData.resultStatus;
    if (updateData.resultData !== undefined) dbUpdates.result_data = updateData.resultData;
    if (updateData.errorMessage !== undefined) dbUpdates.error_message = updateData.errorMessage;
    if (updateData.executionPlan !== undefined) dbUpdates.execution_plan = updateData.executionPlan;
    if (updateData.parsedIntent !== undefined) dbUpdates.parsed_intent = updateData.parsedIntent;
    if (updateData.completed_at !== undefined) dbUpdates.completed_at = updateData.completed_at;

    await supabase
      .from('assistant_commands')
      .update(dbUpdates)
      .eq('id', commandId);
  } catch (e) {
    console.error('更新助理指令記錄失敗:', e.message);
  }
}

/**
 * Get recent assistant actions for a user or group
 *
 * @param {Object} params
 * @param {string|null} params.userId - Filter by actor_user_id
 * @param {string|null} params.groupId - Filter by source_group_id
 * @param {number} params.limit - Max records to return (default 20)
 * @returns {Promise<Array>} Array of assistant command records
 */
export async function getRecentActions({ userId, groupId, limit = 20 } = {}) {
  try {
    if (!supabase) return [];

    let query = supabase
      .from('assistant_commands')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userId) query = query.eq('actor_user_id', userId);
    if (groupId) query = query.eq('source_group_id', groupId);

    const { data } = await query;
    return data || [];
  } catch (e) {
    console.error('取得助理指令記錄失敗:', e.message);
    return [];
  }
}
