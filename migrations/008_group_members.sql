-- 群組成員追蹤
-- 記錄哪些員工在哪些群組，用於自動偵測 PO 和發送通知

-- 群組成員表
CREATE TABLE IF NOT EXISTS line_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    line_user_id VARCHAR(255),
    role VARCHAR(50), -- 該員工的角色 (sales, leader, admin, etc.)
    is_project_owner BOOLEAN DEFAULT false,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(group_id, user_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_group_members_group ON line_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON line_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_line_user ON line_group_members(line_user_id);

-- 停用 RLS (webhook 需要寫入)
ALTER TABLE line_group_members DISABLE ROW LEVEL SECURITY;

-- 更新 line_groups 表，移除單一 owner，改用 group_members
-- (保留 owner_user_id 作為主要 PO，但通知會發給所有成員)
COMMENT ON COLUMN line_groups.owner_user_id IS '主要 Project Owner (業務)，自動從群組成員中的 sales 偵測';
