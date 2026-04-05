// Wiki Query API — 查詢公司 Wiki
import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';
import { queryWiki } from '../../../utils/companyWiki';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: '缺少 Supabase 設定' });
  }

  const { question, clientName } = req.body;

  if (!question) {
    return res.status(400).json({ error: '缺少必要欄位：question' });
  }

  try {
    const result = await queryWiki(question, {
      clientName: clientName || null,
    });

    return res.status(200).json({
      wikiContext: result.wikiContext || '',
      sources: result.sources || [],
      wikiHit: result.wikiHit || false,
    });
  } catch (error) {
    console.error('Wiki query error:', error);
    return res.status(500).json({ error: '查詢失敗', details: error.message });
  }
}
