-- ============================================
-- Step 2: 建立文件向量嵌入表
-- ============================================
-- 這個表儲存文件內容的向量表示，用於相似度搜尋

CREATE TABLE IF NOT EXISTS document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 關聯到原始文件
    document_id UUID REFERENCES project_documents(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,

    -- 文件內容 (解析後的純文字)
    content_text TEXT NOT NULL,

    -- 內容區塊 (大文件會分成多個 chunks)
    chunk_index INTEGER DEFAULT 0,
    chunk_total INTEGER DEFAULT 1,

    -- 向量嵌入 (使用 1536 維度，適用於 OpenAI/Claude embeddings)
    embedding vector(1536),

    -- 文件元資料 (方便搜尋時快速取得)
    document_type VARCHAR(50),      -- proposal, contract, specification, etc.
    document_name VARCHAR(255),
    client_name VARCHAR(255),

    -- 額外標籤 (用於過濾)
    tags TEXT[],

    -- 時間戳記
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 建立向量搜尋索引 (使用 IVFFlat 算法，適合中小型資料集)
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector
ON document_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 建立一般索引加速查詢
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id ON document_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_project_id ON document_embeddings(project_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_type ON document_embeddings(document_type);

-- 建立相似度搜尋函數
CREATE OR REPLACE FUNCTION search_similar_documents(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5,
    filter_document_type VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    project_id UUID,
    content_text TEXT,
    document_type VARCHAR,
    document_name VARCHAR,
    client_name VARCHAR,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        de.id,
        de.document_id,
        de.project_id,
        de.content_text,
        de.document_type,
        de.document_name,
        de.client_name,
        1 - (de.embedding <=> query_embedding) AS similarity
    FROM document_embeddings de
    WHERE
        (filter_document_type IS NULL OR de.document_type = filter_document_type)
        AND 1 - (de.embedding <=> query_embedding) > match_threshold
    ORDER BY de.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 設定 RLS 政策 (Row Level Security)
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;

-- 允許所有已認證用戶讀取
CREATE POLICY "Allow authenticated read" ON document_embeddings
    FOR SELECT TO authenticated USING (true);

-- 允許所有已認證用戶插入
CREATE POLICY "Allow authenticated insert" ON document_embeddings
    FOR INSERT TO authenticated WITH CHECK (true);

-- 允許所有已認證用戶更新
CREATE POLICY "Allow authenticated update" ON document_embeddings
    FOR UPDATE TO authenticated USING (true);

-- 允許所有已認證用戶刪除
CREATE POLICY "Allow authenticated delete" ON document_embeddings
    FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE document_embeddings IS '儲存文件內容的向量嵌入，用於 AI 相似度搜尋和文件生成';
