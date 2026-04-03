-- 系統設定表 — 儲存全域設定（如 Google admin token）
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE system_settings IS '系統設定 - 儲存全域 key-value 設定';

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view system_settings"
    ON system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can upsert system_settings"
    ON system_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update system_settings"
    ON system_settings FOR UPDATE TO authenticated USING (true);
