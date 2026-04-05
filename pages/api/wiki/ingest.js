// Wiki Ingest API — 投餵內容到公司 Wiki
import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';
import { ingest } from '../../../utils/companyWiki';

export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: '缺少 Supabase 設定' });
  }

  const { sourceType, content, title, clientName, projectId, userId: bodyUserId } = req.body;

  if (!sourceType || !content) {
    return res.status(400).json({ error: '缺少必要欄位：sourceType, content' });
  }

  const validTypes = ['document', 'conversation', 'meeting_note', 'manual', 'correction', 'code'];
  if (!validTypes.includes(sourceType)) {
    return res.status(400).json({ error: `無效的 sourceType，可選值：${validTypes.join(', ')}` });
  }

  // 取得 userId：優先從 Supabase auth token，fallback 到 body
  let userId = bodyUserId || null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    } catch (e) {
      // 忽略 token 解析錯誤，使用 body 中的 userId
    }
  }

  try {
    const result = await ingest({
      sourceType,
      content,
      title: title || '',
      clientName: clientName || '',
      projectId: projectId || null,
      userId,
    });

    return res.status(200).json({
      success: true,
      affectedPaths: result.affectedPaths,
      articlesCreated: result.articlesCreated,
      articlesUpdated: result.articlesUpdated,
    });
  } catch (error) {
    console.error('Wiki ingest error:', error);
    return res.status(500).json({ error: '消化失敗', details: error.message });
  }
}
