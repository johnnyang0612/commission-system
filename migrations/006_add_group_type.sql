-- 新增群組類型欄位
ALTER TABLE line_groups ADD COLUMN IF NOT EXISTS group_type VARCHAR(20) DEFAULT 'prospect';
-- prospect: 客戶洽談群
-- internal: 內部專屬群 (業務+老闆+PM+會計)
-- team: 團隊大群
-- project: 專案執行群
-- other: 其他

-- 新增備註欄位
ALTER TABLE line_groups ADD COLUMN IF NOT EXISTS notes TEXT;

-- 新增負責人
ALTER TABLE line_groups ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

-- 索引
CREATE INDEX IF NOT EXISTS idx_line_groups_type ON line_groups(group_type);

COMMENT ON COLUMN line_groups.group_type IS '群組類型: prospect=客戶洽談, internal=內部專屬, team=團隊大群, project=專案執行, other=其他';
