-- 建立專案文件管理表
CREATE TABLE IF NOT EXISTS project_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, -- 'proposal', 'contract', 'specification', 'meeting_notes', 'other'
  document_name VARCHAR(200) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  file_type VARCHAR(100),
  public_url TEXT,
  bucket_name VARCHAR(50) DEFAULT 'documents',
  
  -- 版本控制
  version_number INTEGER DEFAULT 1,
  parent_document_id UUID REFERENCES project_documents(id), -- 指向原始文件
  is_current_version BOOLEAN DEFAULT true,
  version_notes TEXT, -- 版本更新說明
  
  -- 文件狀態
  document_status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'review', 'approved', 'signed', 'archived'
  approval_date DATE,
  approved_by VARCHAR(255),
  
  -- 重要性和標籤
  is_important BOOLEAN DEFAULT false, -- 重要文件標記
  tags TEXT[], -- 標籤陣列
  description TEXT,
  
  -- 時間戳記
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  
  -- 存取控制
  is_confidential BOOLEAN DEFAULT false, -- 機密文件
  access_level VARCHAR(20) DEFAULT 'normal' -- 'normal', 'restricted', 'confidential'
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_type ON project_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_project_documents_status ON project_documents(document_status);
CREATE INDEX IF NOT EXISTS idx_project_documents_version ON project_documents(version_number);
CREATE INDEX IF NOT EXISTS idx_project_documents_current ON project_documents(is_current_version);
CREATE INDEX IF NOT EXISTS idx_project_documents_tags ON project_documents USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_project_documents_created_at ON project_documents(created_at);

-- 建立觸發器，自動更新 updated_at
CREATE OR REPLACE FUNCTION update_project_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_project_documents_updated_at
  BEFORE UPDATE ON project_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_project_documents_updated_at();

-- 建立文件類型枚舉說明 (註解)
COMMENT ON COLUMN project_documents.document_type IS '文件類型：proposal(提案書), contract(合約), specification(規格書), meeting_notes(會議記錄), amendment(修正案), other(其他)';
COMMENT ON COLUMN project_documents.document_status IS '文件狀態：draft(草稿), review(審核中), approved(已核准), signed(已簽署), archived(已歸檔)';
COMMENT ON COLUMN project_documents.access_level IS '存取層級：normal(一般), restricted(限制), confidential(機密)';

-- 插入預設文件類型範例 (可選)
-- 這可以用來建立文件類型的標準化選項

-- 建立文件變更歷史表 (可選，用於追蹤重要變更)
CREATE TABLE IF NOT EXISTS project_document_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES project_documents(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL, -- 'created', 'updated', 'version_created', 'approved', 'archived'
  old_values JSONB, -- 舊值
  new_values JSONB, -- 新值
  change_reason TEXT,
  changed_by VARCHAR(255),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_history_document_id ON project_document_history(document_id);
CREATE INDEX IF NOT EXISTS idx_document_history_action_type ON project_document_history(action_type);
CREATE INDEX IF NOT EXISTS idx_document_history_changed_at ON project_document_history(changed_at);