-- 員工綁定 LINE 帳號
-- 讓系統能識別群組內的訊息是員工還是客戶發的

-- 1. 在 users 表加入 LINE User ID 欄位
ALTER TABLE users ADD COLUMN IF NOT EXISTS line_user_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS line_display_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS line_picture_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS line_linked_at TIMESTAMP;

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_users_line_user_id ON users(line_user_id);

-- 2. 群組成員表 - 記錄每個群組有哪些成員
CREATE TABLE IF NOT EXISTS line_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    group_id VARCHAR(255) NOT NULL,
    line_user_id VARCHAR(255) NOT NULL,

    -- 成員資訊
    display_name VARCHAR(255),
    picture_url TEXT,

    -- 身份判定
    member_type VARCHAR(20) DEFAULT 'unknown',  -- staff, customer, unknown
    user_id UUID REFERENCES users(id),          -- 如果是員工，關聯到 users 表

    -- 角色
    is_project_owner BOOLEAN DEFAULT false,     -- 是否為此案的負責業務
    role_in_group VARCHAR(50),                  -- owner, member, observer

    -- 狀態
    is_active BOOLEAN DEFAULT true,
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP,

    -- 統計
    message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(group_id, line_user_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_lgm_group ON line_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_lgm_user ON line_group_members(line_user_id);
CREATE INDEX IF NOT EXISTS idx_lgm_type ON line_group_members(member_type);
CREATE INDEX IF NOT EXISTS idx_lgm_owner ON line_group_members(is_project_owner);

-- 3. 更新 line_groups 加入 project owner 欄位
ALTER TABLE line_groups ADD COLUMN IF NOT EXISTS project_owner_id UUID REFERENCES users(id);
ALTER TABLE line_groups ADD COLUMN IF NOT EXISTS team_member_ids UUID[];

-- 4. 觸發器：當收到新訊息時，更新成員統計
CREATE OR REPLACE FUNCTION update_line_member_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- 更新或插入成員記錄
    INSERT INTO line_group_members (group_id, line_user_id, display_name, message_count, last_message_at)
    VALUES (NEW.group_id, NEW.sender_id, NEW.sender_name, 1, NEW.timestamp)
    ON CONFLICT (group_id, line_user_id)
    DO UPDATE SET
        display_name = COALESCE(EXCLUDED.display_name, line_group_members.display_name),
        message_count = line_group_members.message_count + 1,
        last_message_at = EXCLUDED.last_message_at,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS line_member_stats_trigger ON line_messages;
CREATE TRIGGER line_member_stats_trigger
    AFTER INSERT ON line_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_line_member_stats();

-- 5. 函數：自動判斷成員身份
CREATE OR REPLACE FUNCTION identify_line_member_type(p_line_user_id VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- 檢查是否為已綁定的員工
    SELECT id INTO v_user_id
    FROM users
    WHERE line_user_id = p_line_user_id;

    IF v_user_id IS NOT NULL THEN
        RETURN 'staff';
    END IF;

    RETURN 'customer';
END;
$$ LANGUAGE plpgsql;

-- 6. 更新現有成員的身份
CREATE OR REPLACE FUNCTION sync_member_identities()
RETURNS void AS $$
BEGIN
    -- 更新所有已知員工的身份
    UPDATE line_group_members lgm
    SET
        member_type = 'staff',
        user_id = u.id
    FROM users u
    WHERE lgm.line_user_id = u.line_user_id
    AND u.line_user_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE line_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view members"
    ON line_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert members"
    ON line_group_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update members"
    ON line_group_members FOR UPDATE TO authenticated USING (true);

COMMENT ON TABLE line_group_members IS '群組成員表 - 記錄每個 LINE 群組的成員及其身份';
COMMENT ON COLUMN users.line_user_id IS '員工的 LINE User ID，用於識別群組訊息發送者';
