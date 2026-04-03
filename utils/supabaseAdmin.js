// Supabase Admin Client（使用 Service Role Key）
// 用於 API routes、Cron jobs、Webhook 等 server-side 操作
// 繞過 RLS — 只能在 server-side 使用，絕對不能暴露到前端

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;
