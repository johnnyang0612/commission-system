-- ============================================
-- Step 1: 啟用 pgvector 擴充功能
-- ============================================
-- 這個擴充讓 PostgreSQL 可以儲存和搜尋向量資料
-- Supabase 免費版已內建支援

-- 啟用 vector 擴充
CREATE EXTENSION IF NOT EXISTS vector;

-- 驗證擴充是否啟用成功
SELECT * FROM pg_extension WHERE extname = 'vector';
