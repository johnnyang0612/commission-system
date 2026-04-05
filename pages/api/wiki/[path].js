// Wiki Article Detail API — 取得單篇 Wiki 文章
import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: '缺少 Supabase 設定' });
  }

  // path 可以是 "clients/台積電.md" 這樣的格式
  // Next.js dynamic route 會把它當作單個參數
  const { path } = req.query;

  if (!path) {
    return res.status(400).json({ error: '缺少 path 參數' });
  }

  try {
    // 嘗試直接用 path 搜尋
    let { data, error } = await supabase
      .from('wiki_articles')
      .select('*')
      .eq('path', path)
      .single();

    // 如果找不到，嘗試加上常見路徑前綴
    if (!data && !error?.code?.includes('PGRST116')) {
      // path 本身已經是完整路徑
    } else if (!data) {
      // 嘗試模糊搜尋
      const { data: fuzzy } = await supabase
        .from('wiki_articles')
        .select('*')
        .ilike('path', `%${path}%`)
        .limit(1)
        .single();
      data = fuzzy;
    }

    if (!data) {
      return res.status(404).json({ error: '找不到該文章' });
    }

    return res.status(200).json({ article: data });
  } catch (error) {
    console.error('Wiki article detail error:', error);
    return res.status(500).json({ error: '取得文章失敗', details: error.message });
  }
}
