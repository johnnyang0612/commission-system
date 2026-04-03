-- 014_task_reminders.sql
-- 任務提醒系統 - 定時提醒，非會議

CREATE TABLE IF NOT EXISTS task_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT,                          -- LINE group where reminder was created
    created_by_line_id TEXT,                -- LINE user ID of creator
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    remind_at TIMESTAMPTZ NOT NULL,         -- when to fire the reminder
    message TEXT NOT NULL,                  -- reminder content
    mention_line_ids TEXT[],                -- LINE user IDs to @ mention
    mention_names TEXT[],                   -- display names for @ mention
    is_fired BOOLEAN DEFAULT false,         -- has the reminder been sent
    fired_at TIMESTAMPTZ,
    is_cancelled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE task_reminders IS '任務提醒 - 定時提醒，非會議';

CREATE INDEX idx_task_reminders_fire ON task_reminders(remind_at) WHERE is_fired = false AND is_cancelled = false;
CREATE INDEX idx_task_reminders_group ON task_reminders(group_id);
CREATE INDEX idx_task_reminders_creator ON task_reminders(created_by_line_id);

ALTER TABLE task_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage task_reminders" ON task_reminders FOR ALL TO authenticated USING (true) WITH CHECK (true);
