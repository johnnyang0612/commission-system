// Wiki Articles API — 列出所有 Wiki 文章
import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: '缺少 Supabase 設定' });
  }

  try {
    const { data, error } = await supabase
      .from('wiki_articles')
      .select('path, title, summary, category, tags, updated_at')
      .neq('category', '_meta')
      .order('category')
      .order('title');

    if (error) {
      throw error;
    }

    return res.status(200).json({ articles: data || [] });
  } catch (error) {
    console.error('Wiki articles list error:', error);
    return res.status(500).json({ error: '取得文章列表失敗', details: error.message });
  }
}
