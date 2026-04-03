-- ============================================================
-- 012_system_upgrade_v2.sql
-- 系統升級 V2：合約管理、付款排程、分潤規則、財務交易、
--              AI 助理、知識文件、聯絡人身份等全新資料表
-- ============================================================
-- 本次遷移包含 18 張新表，涵蓋以下子系統：
--   1. 合約管理（contracts, contract_extraction_results）
--   2. 專案里程碑與付款排程（project_milestones, project_payment_schedules, milestone_payment_links）
--   3. 保固與維護（project_warranties, project_maintenance_plans）
--   4. 分潤規則與事件（commission_rules, commission_events）
--   5. 財務交易與預支（finance_transactions, payout_advance_records）
--   6. 聯絡人與群組成員（contact_identities, group_participants）
--   7. 檔案 metadata（stored_files）
--   8. AI 助理（assistant_commands, agent_tasks）
--   9. 知識文件（knowledge_documents, knowledge_access_policies）
-- ============================================================


-- ============================================
-- 1. contracts（合約主檔）
-- ============================================
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    client_name TEXT,
    client_tax_id TEXT,                              -- 統一編號
    contact_person TEXT,
    contact_email TEXT,
    contract_amount NUMERIC(12,2),
    tax_rate NUMERIC(5,4) DEFAULT 0.05,
    currency TEXT DEFAULT 'TWD',
    is_tax_included BOOLEAN DEFAULT true,
    signed_date DATE,
    file_ids UUID[],                                 -- 關聯的 project_documents IDs
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE contracts IS '合約主檔 - 記錄專案合約資訊，含客戶、金額、稅率等';
COMMENT ON COLUMN contracts.client_tax_id IS '客戶統一編號';
COMMENT ON COLUMN contracts.is_tax_included IS '合約金額是否含稅';
COMMENT ON COLUMN contracts.file_ids IS '關聯的 project_documents UUID 陣列';

CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_name);
CREATE INDEX IF NOT EXISTS idx_contracts_signed_date ON contracts(signed_date);


-- ============================================
-- 2. contract_extraction_results（AI 合約抽取暫存）
-- ============================================
CREATE TABLE IF NOT EXISTS contract_extraction_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL,  -- 在合約建立前可為 NULL
    source_document_id UUID REFERENCES project_documents(id) ON DELETE SET NULL,
    raw_extraction JSONB,                            -- AI 原始輸出
    normalized_data JSONB,                           -- 結構化 / 標準化結果
    confidence_scores JSONB,                         -- 各欄位信心分數 0-1
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'rejected')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE contract_extraction_results IS 'AI 合約抽取暫存 - 儲存 AI 從合約文件中提取的結構化資料';
COMMENT ON COLUMN contract_extraction_results.raw_extraction IS 'AI 原始輸出 JSON';
COMMENT ON COLUMN contract_extraction_results.normalized_data IS '標準化後的結構化資料';
COMMENT ON COLUMN contract_extraction_results.confidence_scores IS '各欄位的信心分數（0-1）';

CREATE INDEX IF NOT EXISTS idx_contract_extraction_contract ON contract_extraction_results(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_extraction_source ON contract_extraction_results(source_document_id);
CREATE INDEX IF NOT EXISTS idx_contract_extraction_status ON contract_extraction_results(status);


-- ============================================
-- 3. project_milestones（驗收點 / 里程碑）
-- ============================================
CREATE TABLE IF NOT EXISTS project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    acceptance_criteria TEXT,
    due_date DATE,
    completed_date DATE,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
    sequence_order INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE project_milestones IS '驗收點 / 里程碑 - 專案交付進度追蹤';
COMMENT ON COLUMN project_milestones.acceptance_criteria IS '驗收條件';
COMMENT ON COLUMN project_milestones.sequence_order IS '里程碑順序';

CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON project_milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_due_date ON project_milestones(due_date);


-- ============================================
-- 4. project_payment_schedules（付款期程）
-- ============================================
CREATE TABLE IF NOT EXISTS project_payment_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    sequence_no INTEGER NOT NULL,
    payment_label TEXT,                              -- 例如 '第一期', '尾款'
    percentage NUMERIC(5,2),
    gross_amount NUMERIC(12,2),
    net_amount NUMERIC(12,2),
    trigger_type TEXT DEFAULT 'milestone'
        CHECK (trigger_type IN ('milestone', 'date', 'manual')),
    trigger_description TEXT,
    due_date DATE,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'invoiced', 'paid', 'overdue')),
    actual_paid_amount NUMERIC(12,2),
    actual_paid_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE project_payment_schedules IS '付款期程 - 記錄每期應收款項與實際收款';
COMMENT ON COLUMN project_payment_schedules.trigger_type IS '觸發條件：milestone=驗收, date=日期, manual=手動';
COMMENT ON COLUMN project_payment_schedules.gross_amount IS '含稅金額';
COMMENT ON COLUMN project_payment_schedules.net_amount IS '未稅金額';

CREATE INDEX IF NOT EXISTS idx_payment_schedules_project ON project_payment_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_status ON project_payment_schedules(status);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_due_date ON project_payment_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_sequence ON project_payment_schedules(project_id, sequence_no);


-- ============================================
-- 5. milestone_payment_links（驗收與付款關聯）
-- ============================================
CREATE TABLE IF NOT EXISTS milestone_payment_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
    payment_schedule_id UUID NOT NULL REFERENCES project_payment_schedules(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(milestone_id, payment_schedule_id)
);

COMMENT ON TABLE milestone_payment_links IS '驗收與付款關聯 - 多對多對應，驗收通過才觸發付款';

CREATE INDEX IF NOT EXISTS idx_milestone_payment_milestone ON milestone_payment_links(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_payment_schedule ON milestone_payment_links(payment_schedule_id);


-- ============================================
-- 6. project_warranties（保固條件）
-- ============================================
CREATE TABLE IF NOT EXISTS project_warranties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    warranty_days INTEGER,
    start_trigger TEXT DEFAULT 'acceptance'
        CHECK (start_trigger IN ('acceptance', 'delivery', 'sign_date', 'custom')),
    start_trigger_description TEXT,
    start_date DATE,
    end_date DATE,
    scope TEXT,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'expired')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE project_warranties IS '保固條件 - 每專案一筆保固紀錄';
COMMENT ON COLUMN project_warranties.start_trigger IS '保固起算條件：acceptance=驗收, delivery=交付, sign_date=簽約日, custom=自訂';
COMMENT ON COLUMN project_warranties.warranty_days IS '保固天數';

CREATE INDEX IF NOT EXISTS idx_warranties_project ON project_warranties(project_id);
CREATE INDEX IF NOT EXISTS idx_warranties_status ON project_warranties(status);
CREATE INDEX IF NOT EXISTS idx_warranties_end_date ON project_warranties(end_date);


-- ============================================
-- 7. project_maintenance_plans（維護費計畫）
-- ============================================
CREATE TABLE IF NOT EXISTS project_maintenance_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    enabled BOOLEAN DEFAULT false,
    start_rule TEXT DEFAULT 'warranty_end'
        CHECK (start_rule IN ('warranty_end', 'fixed_date', 'custom')),
    start_date DATE,
    monthly_fee NUMERIC(12,2),
    billing_cycle TEXT DEFAULT 'monthly'
        CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
    notes TEXT,
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'paused', 'ended')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE project_maintenance_plans IS '維護費計畫 - 每專案一筆維護方案，保固結束後啟動';
COMMENT ON COLUMN project_maintenance_plans.start_rule IS '啟動規則：warranty_end=保固結束, fixed_date=固定日期, custom=自訂';
COMMENT ON COLUMN project_maintenance_plans.billing_cycle IS '計費週期：monthly=月繳, quarterly=季繳, yearly=年繳';

CREATE INDEX IF NOT EXISTS idx_maintenance_project ON project_maintenance_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON project_maintenance_plans(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_enabled ON project_maintenance_plans(enabled);


-- ============================================
-- 8. commission_rules（每案分潤規則）
-- ============================================
CREATE TABLE IF NOT EXISTS commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    commission_rate NUMERIC(5,4) NOT NULL,           -- 例如 0.2500 代表 25%
    basis_type TEXT DEFAULT 'net_received'
        CHECK (basis_type IN ('net_received', 'gross_received', 'contract_amount')),
    tax_rate_for_deduction NUMERIC(5,4) DEFAULT 0.05,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, user_id)
);

COMMENT ON TABLE commission_rules IS '每案分潤規則 - 定義每位業務在每個專案的分潤比例與計算基礎';
COMMENT ON COLUMN commission_rules.commission_rate IS '分潤比例，例如 0.2500 = 25%';
COMMENT ON COLUMN commission_rules.basis_type IS '計算基礎：net_received=實收淨額, gross_received=實收含稅, contract_amount=合約金額';

CREATE INDEX IF NOT EXISTS idx_commission_rules_project ON commission_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_user ON commission_rules(user_id);


-- ============================================
-- 9. commission_events（分潤來源事件）
-- ============================================
CREATE TABLE IF NOT EXISTS commission_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    commission_rule_id UUID REFERENCES commission_rules(id) ON DELETE SET NULL,
    payment_schedule_id UUID REFERENCES project_payment_schedules(id) ON DELETE SET NULL,
    trigger_type TEXT NOT NULL
        CHECK (trigger_type IN ('customer_payment', 'advance', 'bonus', 'adjustment')),
    gross_received NUMERIC(12,2),
    tax_deducted NUMERIC(12,2),
    net_received NUMERIC(12,2),
    commission_rate NUMERIC(5,4),
    calculated_commission NUMERIC(12,2),
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE commission_events IS '分潤來源事件 - 每次客戶付款或調整時產生的分潤計算紀錄';
COMMENT ON COLUMN commission_events.trigger_type IS '觸發類型：customer_payment=客戶付款, advance=預支, bonus=獎金, adjustment=調整';
COMMENT ON COLUMN commission_events.calculated_commission IS '系統計算的分潤金額';

CREATE INDEX IF NOT EXISTS idx_commission_events_project ON commission_events(project_id);
CREATE INDEX IF NOT EXISTS idx_commission_events_user ON commission_events(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_events_rule ON commission_events(commission_rule_id);
CREATE INDEX IF NOT EXISTS idx_commission_events_payment ON commission_events(payment_schedule_id);
CREATE INDEX IF NOT EXISTS idx_commission_events_status ON commission_events(status);
CREATE INDEX IF NOT EXISTS idx_commission_events_trigger ON commission_events(trigger_type);
CREATE INDEX IF NOT EXISTS idx_commission_events_created ON commission_events(created_at);


-- ============================================
-- 10. finance_transactions（統一交易事件）
-- ============================================
CREATE TABLE IF NOT EXISTS finance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL
        CHECK (transaction_type IN (
            'customer_payment', 'commission_payout', 'advance_payout',
            'bonus', 'subcontract_expense', 'maintenance_income',
            'adjustment', 'other'
        )),
    amount NUMERIC(12,2) NOT NULL,
    currency TEXT DEFAULT 'TWD',
    description TEXT,
    reference_type TEXT,                             -- 例如 'commission_event', 'labor_receipt', 'payment_schedule'
    reference_id UUID,
    needs_labor_receipt BOOLEAN DEFAULT false,
    labor_receipt_id INTEGER REFERENCES labor_receipts(id) ON DELETE SET NULL,
    transaction_date DATE DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE finance_transactions IS '統一交易事件 - 記錄所有財務進出，含客戶收款、分潤撥付、維護費收入等';
COMMENT ON COLUMN finance_transactions.transaction_type IS '交易類型：customer_payment=客戶付款, commission_payout=分潤撥付, advance_payout=預支撥付, bonus=獎金, subcontract_expense=外包費用, maintenance_income=維護費收入, adjustment=調整, other=其他';
COMMENT ON COLUMN finance_transactions.reference_type IS '關聯資料來源表名';
COMMENT ON COLUMN finance_transactions.reference_id IS '關聯資料來源 ID';

CREATE INDEX IF NOT EXISTS idx_finance_tx_project ON finance_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_finance_tx_user ON finance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_tx_type ON finance_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_finance_tx_date ON finance_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_finance_tx_reference ON finance_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_finance_tx_labor_receipt ON finance_transactions(labor_receipt_id);
CREATE INDEX IF NOT EXISTS idx_finance_tx_created_by ON finance_transactions(created_by);


-- ============================================
-- 11. payout_advance_records（分潤預支）
-- ============================================
CREATE TABLE IF NOT EXISTS payout_advance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    advance_amount NUMERIC(12,2) NOT NULL,
    remaining_to_offset NUMERIC(12,2) NOT NULL,
    offset_status TEXT DEFAULT 'pending'
        CHECK (offset_status IN ('pending', 'partially_offset', 'fully_offset')),
    reason TEXT,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE payout_advance_records IS '分潤預支 - 業務預支分潤紀錄，後續從實際分潤中扣回';
COMMENT ON COLUMN payout_advance_records.remaining_to_offset IS '尚未扣回的餘額';
COMMENT ON COLUMN payout_advance_records.offset_status IS '扣回狀態：pending=待扣回, partially_offset=部分扣回, fully_offset=已全部扣回';

CREATE INDEX IF NOT EXISTS idx_advance_project ON payout_advance_records(project_id);
CREATE INDEX IF NOT EXISTS idx_advance_user ON payout_advance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_advance_status ON payout_advance_records(offset_status);
CREATE INDEX IF NOT EXISTS idx_advance_approved_by ON payout_advance_records(approved_by);


-- ============================================
-- 12. contact_identities（聯絡人身份主檔）
-- ============================================
CREATE TABLE IF NOT EXISTS contact_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_user_id TEXT,                               -- LINE User ID，可為 NULL
    display_name TEXT,
    real_name TEXT,
    identity_type TEXT DEFAULT 'unknown'
        CHECK (identity_type IN ('employee', 'client', 'vip', 'vendor', 'po', 'unknown')),
    company TEXT,
    email TEXT,
    phone TEXT,
    internal_user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- 員工時關聯系統用戶
    tags TEXT[],
    notes TEXT,
    is_manually_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE contact_identities IS '聯絡人身份主檔 - 統一管理 LINE 用戶、客戶、供應商等身份';
COMMENT ON COLUMN contact_identities.line_user_id IS 'LINE User ID（可為 NULL）';
COMMENT ON COLUMN contact_identities.identity_type IS '身份類型：employee=員工, client=客戶, vip=VIP, vendor=供應商, po=PO, unknown=未知';
COMMENT ON COLUMN contact_identities.internal_user_id IS '系統用戶 ID（員工時填寫）';

CREATE INDEX IF NOT EXISTS idx_contact_line_user ON contact_identities(line_user_id);
CREATE INDEX IF NOT EXISTS idx_contact_type ON contact_identities(identity_type);
CREATE INDEX IF NOT EXISTS idx_contact_internal_user ON contact_identities(internal_user_id);
CREATE INDEX IF NOT EXISTS idx_contact_company ON contact_identities(company);
CREATE INDEX IF NOT EXISTS idx_contact_email ON contact_identities(email);


-- ============================================
-- 13. group_participants（群組成員映射）
-- ============================================
CREATE TABLE IF NOT EXISTS group_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_group_id TEXT NOT NULL,                     -- 關聯 line_groups.group_id
    identity_id UUID NOT NULL REFERENCES contact_identities(id) ON DELETE CASCADE,
    role_in_group TEXT DEFAULT 'member'
        CHECK (role_in_group IN ('member', 'admin', 'owner', 'pm', 'client_contact', 'observer')),
    manually_verified BOOLEAN DEFAULT false,
    joined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(line_group_id, identity_id)
);

COMMENT ON TABLE group_participants IS '群組成員映射 - LINE 群組成員與聯絡人身份的對應';
COMMENT ON COLUMN group_participants.line_group_id IS '對應 line_groups.group_id';
COMMENT ON COLUMN group_participants.role_in_group IS '群組內角色：member=成員, admin=管理員, owner=群主, pm=PM, client_contact=客戶窗口, observer=觀察者';

CREATE INDEX IF NOT EXISTS idx_group_participants_group ON group_participants(line_group_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_identity ON group_participants(identity_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_role ON group_participants(role_in_group);


-- ============================================
-- 14. stored_files（檔案 metadata）
-- ============================================
CREATE TABLE IF NOT EXISTS stored_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_key TEXT NOT NULL,                       -- Supabase Storage 物件路徑
    original_file_name TEXT,
    mime_type TEXT,
    file_extension TEXT,
    file_size_bytes BIGINT,
    source_type TEXT DEFAULT 'line'
        CHECK (source_type IN ('line', 'upload', 'system')),
    source_message_id TEXT,                          -- LINE 訊息 ID
    source_group_id TEXT,                            -- LINE 群組 ID
    uploaded_by_identity_id UUID REFERENCES contact_identities(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE stored_files IS '檔案 metadata - 統一管理所有儲存檔案的 metadata';
COMMENT ON COLUMN stored_files.storage_key IS 'Supabase Storage 物件路徑（bucket 內的 key）';
COMMENT ON COLUMN stored_files.source_type IS '來源：line=LINE 訊息, upload=使用者上傳, system=系統產生';

CREATE INDEX IF NOT EXISTS idx_stored_files_storage_key ON stored_files(storage_key);
CREATE INDEX IF NOT EXISTS idx_stored_files_source_type ON stored_files(source_type);
CREATE INDEX IF NOT EXISTS idx_stored_files_source_message ON stored_files(source_message_id);
CREATE INDEX IF NOT EXISTS idx_stored_files_source_group ON stored_files(source_group_id);
CREATE INDEX IF NOT EXISTS idx_stored_files_project ON stored_files(project_id);
CREATE INDEX IF NOT EXISTS idx_stored_files_identity ON stored_files(uploaded_by_identity_id);
CREATE INDEX IF NOT EXISTS idx_stored_files_mime ON stored_files(mime_type);


-- ============================================
-- 15. assistant_commands（AI 助理執行紀錄）
-- ============================================
CREATE TABLE IF NOT EXISTS assistant_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_identity_id UUID REFERENCES contact_identities(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    channel TEXT NOT NULL
        CHECK (channel IN ('line_group', 'line_private', 'web_chat', 'system')),
    source_group_id TEXT,
    command_type TEXT NOT NULL,                       -- 例如 'create_meeting', 'bind_email', 'retrieve_file', 'query', 'generate_doc'
    raw_input TEXT,
    parsed_intent JSONB,
    execution_plan JSONB,
    result_status TEXT DEFAULT 'pending'
        CHECK (result_status IN ('pending', 'executing', 'success', 'failed', 'cancelled')),
    result_data JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ
);

COMMENT ON TABLE assistant_commands IS 'AI 助理執行紀錄 - 記錄所有 AI 助理收到的指令與執行結果';
COMMENT ON COLUMN assistant_commands.channel IS '來源頻道：line_group=LINE群組, line_private=LINE私訊, web_chat=網頁聊天, system=系統';
COMMENT ON COLUMN assistant_commands.command_type IS '指令類型，例如 create_meeting, bind_email, retrieve_file, query, generate_doc';

CREATE INDEX IF NOT EXISTS idx_assistant_cmd_identity ON assistant_commands(actor_identity_id);
CREATE INDEX IF NOT EXISTS idx_assistant_cmd_user ON assistant_commands(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_cmd_channel ON assistant_commands(channel);
CREATE INDEX IF NOT EXISTS idx_assistant_cmd_type ON assistant_commands(command_type);
CREATE INDEX IF NOT EXISTS idx_assistant_cmd_status ON assistant_commands(result_status);
CREATE INDEX IF NOT EXISTS idx_assistant_cmd_group ON assistant_commands(source_group_id);
CREATE INDEX IF NOT EXISTS idx_assistant_cmd_created ON assistant_commands(created_at);


-- ============================================
-- 16. agent_tasks（AI Agent 工作流任務）
-- ============================================
CREATE TABLE IF NOT EXISTS agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    channel TEXT NOT NULL
        CHECK (channel IN ('web_chat', 'line', 'system')),
    intent TEXT NOT NULL,
    context JSONB,
    execution_plan JSONB,
    confirmation_status TEXT DEFAULT 'pending'
        CHECK (confirmation_status IN ('pending', 'confirmed', 'rejected')),
    confirmed_at TIMESTAMPTZ,
    execution_status TEXT DEFAULT 'pending'
        CHECK (execution_status IN ('pending', 'executing', 'completed', 'failed')),
    result JSONB,
    permission_level TEXT DEFAULT 'query'
        CHECK (permission_level IN ('query', 'generate', 'modify', 'financial', 'delete')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE agent_tasks IS 'AI Agent 工作流任務 - 記錄 AI Agent 的任務規劃、確認與執行狀態';
COMMENT ON COLUMN agent_tasks.intent IS '使用者意圖';
COMMENT ON COLUMN agent_tasks.confirmation_status IS '確認狀態：pending=待確認, confirmed=已確認, rejected=已拒絕';
COMMENT ON COLUMN agent_tasks.execution_status IS '執行狀態：pending=待執行, executing=執行中, completed=已完成, failed=失敗';
COMMENT ON COLUMN agent_tasks.permission_level IS '權限等級：query=查詢, generate=產生, modify=修改, financial=財務, delete=刪除';

CREATE INDEX IF NOT EXISTS idx_agent_tasks_requested_by ON agent_tasks(requested_by);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_channel ON agent_tasks(channel);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_confirmation ON agent_tasks(confirmation_status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_execution ON agent_tasks(execution_status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_permission ON agent_tasks(permission_level);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created ON agent_tasks(created_at);


-- ============================================
-- 17. knowledge_documents（公司知識文件總表）
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type TEXT NOT NULL
        CHECK (document_type IN (
            'proposal', 'specification', 'quotation', 'contract',
            'meeting_notes', 'internal_guide', 'template'
        )),
    source_type TEXT DEFAULT 'upload'
        CHECK (source_type IN ('upload', 'generated', 'imported')),
    source_document_id UUID REFERENCES project_documents(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('draft', 'active', 'archived', 'deprecated')),
    visibility_scope TEXT DEFAULT 'company'
        CHECK (visibility_scope IN ('company', 'team', 'personal')),
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    client_name TEXT,
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE knowledge_documents IS '公司知識文件總表 - 管理提案書、規格書、報價單等知識文件的 metadata';
COMMENT ON COLUMN knowledge_documents.document_type IS '文件類型：proposal=提案書, specification=規格書, quotation=報價單, contract=合約, meeting_notes=會議記錄, internal_guide=內部指南, template=範本';
COMMENT ON COLUMN knowledge_documents.source_type IS '來源：upload=上傳, generated=AI產生, imported=匯入';
COMMENT ON COLUMN knowledge_documents.visibility_scope IS '可見範圍：company=全公司, team=團隊, personal=個人';

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_type ON knowledge_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_source_type ON knowledge_documents(source_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_source_doc ON knowledge_documents(source_document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_status ON knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_visibility ON knowledge_documents(visibility_scope);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_owner ON knowledge_documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_project ON knowledge_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_client ON knowledge_documents(client_name);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tags ON knowledge_documents USING GIN(tags);


-- ============================================
-- 18. knowledge_access_policies（文件可見範圍）
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_access_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    access_type TEXT NOT NULL
        CHECK (access_type IN ('role', 'user', 'team')),
    role_scope TEXT,                                 -- 例如 'admin', 'sales', 'all'
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE knowledge_access_policies IS '文件可見範圍 - 控制知識文件的存取權限';
COMMENT ON COLUMN knowledge_access_policies.access_type IS '權限類型：role=角色, user=個人, team=團隊';
COMMENT ON COLUMN knowledge_access_policies.role_scope IS '角色範圍，例如 admin, sales, all';

CREATE INDEX IF NOT EXISTS idx_knowledge_access_doc ON knowledge_access_policies(knowledge_document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_access_type ON knowledge_access_policies(access_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_access_role ON knowledge_access_policies(role_scope);
CREATE INDEX IF NOT EXISTS idx_knowledge_access_user ON knowledge_access_policies(user_id);


-- ============================================
-- RLS 政策（所有新表啟用 RLS）
-- ============================================

-- 合約管理
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_extraction_results ENABLE ROW LEVEL SECURITY;

-- 專案進度與付款
ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestone_payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_maintenance_plans ENABLE ROW LEVEL SECURITY;

-- 分潤
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_events ENABLE ROW LEVEL SECURITY;

-- 財務
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_advance_records ENABLE ROW LEVEL SECURITY;

-- 聯絡人與群組
ALTER TABLE contact_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_participants ENABLE ROW LEVEL SECURITY;

-- 檔案
ALTER TABLE stored_files ENABLE ROW LEVEL SECURITY;

-- AI 助理
ALTER TABLE assistant_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;

-- 知識文件
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_access_policies ENABLE ROW LEVEL SECURITY;


-- ============================================
-- RLS 政策：authenticated 用戶可讀寫所有新表
-- （後續可依業務需求細化權限）
-- ============================================

-- contracts
CREATE POLICY "Authenticated users can view contracts"
    ON contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contracts"
    ON contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contracts"
    ON contracts FOR UPDATE TO authenticated USING (true);

-- contract_extraction_results
CREATE POLICY "Authenticated users can view contract_extraction_results"
    ON contract_extraction_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contract_extraction_results"
    ON contract_extraction_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contract_extraction_results"
    ON contract_extraction_results FOR UPDATE TO authenticated USING (true);

-- project_milestones
CREATE POLICY "Authenticated users can view project_milestones"
    ON project_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_milestones"
    ON project_milestones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update project_milestones"
    ON project_milestones FOR UPDATE TO authenticated USING (true);

-- project_payment_schedules
CREATE POLICY "Authenticated users can view project_payment_schedules"
    ON project_payment_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_payment_schedules"
    ON project_payment_schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update project_payment_schedules"
    ON project_payment_schedules FOR UPDATE TO authenticated USING (true);

-- milestone_payment_links
CREATE POLICY "Authenticated users can view milestone_payment_links"
    ON milestone_payment_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert milestone_payment_links"
    ON milestone_payment_links FOR INSERT TO authenticated WITH CHECK (true);

-- project_warranties
CREATE POLICY "Authenticated users can view project_warranties"
    ON project_warranties FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_warranties"
    ON project_warranties FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update project_warranties"
    ON project_warranties FOR UPDATE TO authenticated USING (true);

-- project_maintenance_plans
CREATE POLICY "Authenticated users can view project_maintenance_plans"
    ON project_maintenance_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert project_maintenance_plans"
    ON project_maintenance_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update project_maintenance_plans"
    ON project_maintenance_plans FOR UPDATE TO authenticated USING (true);

-- commission_rules
CREATE POLICY "Authenticated users can view commission_rules"
    ON commission_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert commission_rules"
    ON commission_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update commission_rules"
    ON commission_rules FOR UPDATE TO authenticated USING (true);

-- commission_events
CREATE POLICY "Authenticated users can view commission_events"
    ON commission_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert commission_events"
    ON commission_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update commission_events"
    ON commission_events FOR UPDATE TO authenticated USING (true);

-- finance_transactions
CREATE POLICY "Authenticated users can view finance_transactions"
    ON finance_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert finance_transactions"
    ON finance_transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update finance_transactions"
    ON finance_transactions FOR UPDATE TO authenticated USING (true);

-- payout_advance_records
CREATE POLICY "Authenticated users can view payout_advance_records"
    ON payout_advance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert payout_advance_records"
    ON payout_advance_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update payout_advance_records"
    ON payout_advance_records FOR UPDATE TO authenticated USING (true);

-- contact_identities
CREATE POLICY "Authenticated users can view contact_identities"
    ON contact_identities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contact_identities"
    ON contact_identities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contact_identities"
    ON contact_identities FOR UPDATE TO authenticated USING (true);

-- group_participants
CREATE POLICY "Authenticated users can view group_participants"
    ON group_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert group_participants"
    ON group_participants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update group_participants"
    ON group_participants FOR UPDATE TO authenticated USING (true);

-- stored_files
CREATE POLICY "Authenticated users can view stored_files"
    ON stored_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert stored_files"
    ON stored_files FOR INSERT TO authenticated WITH CHECK (true);

-- assistant_commands
CREATE POLICY "Authenticated users can view assistant_commands"
    ON assistant_commands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert assistant_commands"
    ON assistant_commands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update assistant_commands"
    ON assistant_commands FOR UPDATE TO authenticated USING (true);

-- agent_tasks
CREATE POLICY "Authenticated users can view agent_tasks"
    ON agent_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert agent_tasks"
    ON agent_tasks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update agent_tasks"
    ON agent_tasks FOR UPDATE TO authenticated USING (true);

-- knowledge_documents
CREATE POLICY "Authenticated users can view knowledge_documents"
    ON knowledge_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert knowledge_documents"
    ON knowledge_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update knowledge_documents"
    ON knowledge_documents FOR UPDATE TO authenticated USING (true);

-- knowledge_access_policies
CREATE POLICY "Authenticated users can view knowledge_access_policies"
    ON knowledge_access_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert knowledge_access_policies"
    ON knowledge_access_policies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete knowledge_access_policies"
    ON knowledge_access_policies FOR DELETE TO authenticated USING (true);


-- ============================================
-- 完成
-- ============================================
-- 遷移完成：共建立 18 張新表
-- 請在 Supabase SQL Editor 中執行此檔案
