// Wiki Correction API — 從使用者修正中學習
import { supabaseAdmin as supabase } from '../../../utils/supabaseAdmin';
import { learnFromCorrection } from '../../../utils/companyWiki';

export const config = {
  api: {
    bodyParser: { sizeLimit: '5mb' },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({ error: '缺少 Supabase 設定' });
  }

  const { originalOutput, correctedOutput, contextType, clientName, userId } = req.body;

  if (!originalOutput || !correctedOutput || !contextType) {
    return res.status(400).json({ error: '缺少必要欄位：originalOutput, correctedOutput, contextType' });
  }

  const validContextTypes = ['proposal', 'reply', 'report', 'email'];
  if (!validContextTypes.includes(contextType)) {
    return res.status(400).json({ error: `無效的 contextType，可選值：${validContextTypes.join(', ')}` });
  }

  try {
    const analysis = await learnFromCorrection({
      originalOutput,
      correctedOutput,
      contextType,
      clientName: clientName || null,
      userId: userId || null,
    });

    return res.status(200).json({
      success: true,
      analysis: analysis || null,
    });
  } catch (error) {
    console.error('Wiki correction error:', error);
    return res.status(500).json({ error: '修正學習失敗', details: error.message });
  }
}
