// Wiki Lint Cron Job — 定期巡檢 Wiki 健康度
import { lintWiki } from '../../../utils/companyWiki';

export default async function handler(req, res) {
  // 保護 cron job
  const cronSecret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await lintWiki();

    return res.status(200).json({
      success: true,
      issues: result.issues || [],
      suggestedNewArticles: result.suggested_new_articles || [],
      totalIssues: result.issues?.length || 0,
    });
  } catch (error) {
    console.error('Wiki lint error:', error);
    return res.status(500).json({ error: 'Wiki 巡檢失敗', details: error.message });
  }
}
