// Agent Capabilities API
// Returns the list of capabilities the unified agent supports.
// Useful for rendering help menus in both web and LINE UIs.

import { getCapabilities } from '../../../utils/agentCore';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({ capabilities: getCapabilities() });
}
