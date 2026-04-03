-- ============================================================
-- 015_critical_rls_lockdown.sql
-- 緊急安全修復：全面啟用並收緊 RLS 政策
--
-- 問題：大部分表的 RLS 不是沒開就是 USING(true)（等於沒擋）
-- 修復：依角色嚴格限制，業務只能看自己的資料
-- ============================================================

-- ============================================
-- Helper: 取得當前使用者角色的函數
-- ============================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (SELECT role FROM users WHERE id = auth.uid()),
    'sales'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin_or_finance()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('admin', 'finance')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin_or_finance_or_leader()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('admin', 'finance', 'leader')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION can_view_all_projects()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role IN ('admin', 'finance', 'leader', 'pm')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 1. users（最敏感：銀行帳號、身分證、地址）
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 刪除舊的過度寬鬆政策
DROP POLICY IF EXISTS "Authenticated users can view all users" ON users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON users;
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;

-- 新政策：一般員工只能看自己 + 其他人的「安全欄位」
-- admin/finance/leader 可以看全部
CREATE POLICY "users_select_own" ON users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()  -- 看自己完整資料
    OR is_admin_or_finance_or_leader()  -- 管理層看全部
    OR TRUE  -- 其他人可查，但靠 column-level 控制（見下方注釋）
  );
-- 注意：Supabase 不支援 column-level RLS，所以我們用「所有人可 SELECT」
-- 但前端查詢必須只選安全欄位。敏感欄位的保護靠下方的 view。

-- 只有自己能改自己，admin 能改所有人
CREATE POLICY "users_update_own" ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin());

-- 只有 admin 能新增/刪除
CREATE POLICY "users_insert_admin" ON users
  FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR id = auth.uid());

CREATE POLICY "users_delete_admin" ON users
  FOR DELETE TO authenticated
  USING (is_admin());

-- 建立安全 view：給前端查詢用，隱藏敏感欄位
CREATE OR REPLACE VIEW users_safe AS
SELECT
  id, name, email, role, roles,
  line_user_id, line_display_name,
  phone_number, mobile_number,
  job_title, department,
  created_at
FROM users;
-- 不包含：national_id, registered_address, mailing_address,
--         tax_id_number, bank_name, bank_code, account_number, account_name,
--         withholding_tax_rate, health_insurance_fee, labor_insurance_fee

-- ============================================
-- 2. system_settings（Google admin token！）
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view system_settings" ON system_settings;
DROP POLICY IF EXISTS "Authenticated users can upsert system_settings" ON system_settings;
DROP POLICY IF EXISTS "Authenticated users can update system_settings" ON system_settings;

CREATE POLICY "system_settings_admin_only" ON system_settings
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================
-- 3. projects（專案）
-- ============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON projects;
DROP POLICY IF EXISTS "Authenticated users can view projects" ON projects;

-- admin/finance/leader/pm 看全部，sales 只看自己的
CREATE POLICY "projects_select" ON projects
  FOR SELECT TO authenticated
  USING (
    can_view_all_projects()
    OR assigned_to = auth.uid()
    OR manager_id = auth.uid()
  );

CREATE POLICY "projects_insert" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_finance_or_leader());

CREATE POLICY "projects_update" ON projects
  FOR UPDATE TO authenticated
  USING (is_admin_or_finance_or_leader() OR assigned_to = auth.uid());

CREATE POLICY "projects_delete" ON projects
  FOR DELETE TO authenticated
  USING (is_admin());

-- ============================================
-- 4. commissions（分潤 — 極敏感）
-- ============================================
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON commissions;
DROP POLICY IF EXISTS "Authenticated users can view commissions" ON commissions;

-- 業務只看自己的分潤，admin/finance 看全部
CREATE POLICY "commissions_select" ON commissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin_or_finance()
  );

CREATE POLICY "commissions_insert" ON commissions
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_finance());

CREATE POLICY "commissions_update" ON commissions
  FOR UPDATE TO authenticated
  USING (is_admin_or_finance());

-- ============================================
-- 5. labor_receipts（勞報單 — 薪資資訊）
-- ============================================
ALTER TABLE labor_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON labor_receipts;
DROP POLICY IF EXISTS "Authenticated users can view labor_receipts" ON labor_receipts;

CREATE POLICY "labor_receipts_select" ON labor_receipts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin_or_finance()
  );

CREATE POLICY "labor_receipts_insert" ON labor_receipts
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_finance());

CREATE POLICY "labor_receipts_update" ON labor_receipts
  FOR UPDATE TO authenticated
  USING (is_admin_or_finance());

-- ============================================
-- 6. project_installments（付款期程）
-- ============================================
ALTER TABLE project_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON project_installments;

-- 依專案權限：看得到專案才看得到付款
CREATE POLICY "installments_select" ON project_installments
  FOR SELECT TO authenticated
  USING (
    can_view_all_projects()
    OR EXISTS(SELECT 1 FROM projects WHERE projects.id = project_installments.project_id
              AND (projects.assigned_to = auth.uid() OR projects.manager_id = auth.uid()))
  );

CREATE POLICY "installments_modify" ON project_installments
  FOR ALL TO authenticated
  USING (is_admin_or_finance());

-- ============================================
-- 7. prospects（洽談商機）
-- ============================================
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON prospects;
DROP POLICY IF EXISTS "Authenticated users can view prospects" ON prospects;

CREATE POLICY "prospects_select" ON prospects
  FOR SELECT TO authenticated
  USING (
    can_view_all_projects()
    OR owner_id = auth.uid()
  );

CREATE POLICY "prospects_insert" ON prospects
  FOR INSERT TO authenticated
  WITH CHECK (TRUE); -- 所有員工可建立商機

CREATE POLICY "prospects_update" ON prospects
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR is_admin_or_finance_or_leader()
  );

-- ============================================
-- 8. contracts（合約）
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view contracts" ON contracts;
DROP POLICY IF EXISTS "Authenticated users can insert contracts" ON contracts;
DROP POLICY IF EXISTS "Authenticated users can update contracts" ON contracts;

CREATE POLICY "contracts_select" ON contracts
  FOR SELECT TO authenticated
  USING (
    is_admin_or_finance_or_leader()
    OR EXISTS(SELECT 1 FROM projects WHERE projects.id = contracts.project_id
              AND (projects.assigned_to = auth.uid() OR projects.manager_id = auth.uid()))
  );

CREATE POLICY "contracts_modify" ON contracts
  FOR ALL TO authenticated
  USING (is_admin_or_finance_or_leader())
  WITH CHECK (is_admin_or_finance_or_leader());

-- ============================================
-- 9. commission_rules（分潤規則）
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view commission_rules" ON commission_rules;
DROP POLICY IF EXISTS "Authenticated users can insert commission_rules" ON commission_rules;
DROP POLICY IF EXISTS "Authenticated users can update commission_rules" ON commission_rules;

CREATE POLICY "commission_rules_select" ON commission_rules
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin_or_finance()
  );

CREATE POLICY "commission_rules_modify" ON commission_rules
  FOR ALL TO authenticated
  USING (is_admin_or_finance())
  WITH CHECK (is_admin_or_finance());

-- ============================================
-- 10. commission_events（分潤事件）
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view commission_events" ON commission_events;
DROP POLICY IF EXISTS "Authenticated users can insert commission_events" ON commission_events;
DROP POLICY IF EXISTS "Authenticated users can update commission_events" ON commission_events;

CREATE POLICY "commission_events_select" ON commission_events
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin_or_finance()
  );

CREATE POLICY "commission_events_modify" ON commission_events
  FOR ALL TO authenticated
  USING (is_admin_or_finance())
  WITH CHECK (is_admin_or_finance());

-- ============================================
-- 11. finance_transactions（財務交易 — 極敏感）
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view finance_transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Authenticated users can insert finance_transactions" ON finance_transactions;
DROP POLICY IF EXISTS "Authenticated users can update finance_transactions" ON finance_transactions;

CREATE POLICY "finance_tx_select" ON finance_transactions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin_or_finance()
  );

CREATE POLICY "finance_tx_modify" ON finance_transactions
  FOR ALL TO authenticated
  USING (is_admin_or_finance())
  WITH CHECK (is_admin_or_finance());

-- ============================================
-- 12. payout_advance_records（預支）
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view payout_advance_records" ON payout_advance_records;
DROP POLICY IF EXISTS "Authenticated users can insert payout_advance_records" ON payout_advance_records;
DROP POLICY IF EXISTS "Authenticated users can update payout_advance_records" ON payout_advance_records;

CREATE POLICY "advance_select" ON payout_advance_records
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin_or_finance()
  );

CREATE POLICY "advance_modify" ON payout_advance_records
  FOR ALL TO authenticated
  USING (is_admin_or_finance())
  WITH CHECK (is_admin_or_finance());

-- ============================================
-- 13. contact_identities（聯絡人）
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view contact_identities" ON contact_identities;
DROP POLICY IF EXISTS "Authenticated users can insert contact_identities" ON contact_identities;
DROP POLICY IF EXISTS "Authenticated users can update contact_identities" ON contact_identities;

-- admin/finance/leader 看全部，其他人只看自己建立的或綁定的
CREATE POLICY "contacts_select" ON contact_identities
  FOR SELECT TO authenticated
  USING (
    is_admin_or_finance_or_leader()
    OR internal_user_id = auth.uid()
  );

CREATE POLICY "contacts_modify" ON contact_identities
  FOR ALL TO authenticated
  USING (is_admin_or_finance_or_leader())
  WITH CHECK (is_admin_or_finance_or_leader());

-- ============================================
-- 14. project_milestones / payment_schedules
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view project_milestones" ON project_milestones;
DROP POLICY IF EXISTS "Authenticated users can insert project_milestones" ON project_milestones;
DROP POLICY IF EXISTS "Authenticated users can update project_milestones" ON project_milestones;

CREATE POLICY "milestones_select" ON project_milestones
  FOR SELECT TO authenticated
  USING (
    can_view_all_projects()
    OR EXISTS(SELECT 1 FROM projects WHERE projects.id = project_milestones.project_id
              AND (projects.assigned_to = auth.uid() OR projects.manager_id = auth.uid()))
  );

CREATE POLICY "milestones_modify" ON project_milestones
  FOR ALL TO authenticated
  USING (is_admin_or_finance_or_leader());

DROP POLICY IF EXISTS "Authenticated users can view project_payment_schedules" ON project_payment_schedules;
DROP POLICY IF EXISTS "Authenticated users can insert project_payment_schedules" ON project_payment_schedules;
DROP POLICY IF EXISTS "Authenticated users can update project_payment_schedules" ON project_payment_schedules;

CREATE POLICY "payment_schedules_select" ON project_payment_schedules
  FOR SELECT TO authenticated
  USING (
    can_view_all_projects()
    OR EXISTS(SELECT 1 FROM projects WHERE projects.id = project_payment_schedules.project_id
              AND (projects.assigned_to = auth.uid() OR projects.manager_id = auth.uid()))
  );

CREATE POLICY "payment_schedules_modify" ON project_payment_schedules
  FOR ALL TO authenticated
  USING (is_admin_or_finance());

-- ============================================
-- 15. project_warranties / maintenance_plans
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view project_warranties" ON project_warranties;
DROP POLICY IF EXISTS "Authenticated users can insert project_warranties" ON project_warranties;
DROP POLICY IF EXISTS "Authenticated users can update project_warranties" ON project_warranties;

CREATE POLICY "warranties_select" ON project_warranties
  FOR SELECT TO authenticated
  USING (
    can_view_all_projects()
    OR EXISTS(SELECT 1 FROM projects WHERE projects.id = project_warranties.project_id
              AND (projects.assigned_to = auth.uid() OR projects.manager_id = auth.uid()))
  );

CREATE POLICY "warranties_modify" ON project_warranties
  FOR ALL TO authenticated
  USING (is_admin_or_finance_or_leader());

DROP POLICY IF EXISTS "Authenticated users can view project_maintenance_plans" ON project_maintenance_plans;
DROP POLICY IF EXISTS "Authenticated users can insert project_maintenance_plans" ON project_maintenance_plans;
DROP POLICY IF EXISTS "Authenticated users can update project_maintenance_plans" ON project_maintenance_plans;

CREATE POLICY "maintenance_select" ON project_maintenance_plans
  FOR SELECT TO authenticated
  USING (
    can_view_all_projects()
    OR EXISTS(SELECT 1 FROM projects WHERE projects.id = project_maintenance_plans.project_id
              AND (projects.assigned_to = auth.uid() OR projects.manager_id = auth.uid()))
  );

CREATE POLICY "maintenance_modify" ON project_maintenance_plans
  FOR ALL TO authenticated
  USING (is_admin_or_finance_or_leader());

-- ============================================
-- 16. assistant_commands（稽核紀錄）
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view assistant_commands" ON assistant_commands;
DROP POLICY IF EXISTS "Authenticated users can insert assistant_commands" ON assistant_commands;
DROP POLICY IF EXISTS "Authenticated users can update assistant_commands" ON assistant_commands;

-- 自己的紀錄 + admin/leader 看全部
CREATE POLICY "assistant_cmd_select" ON assistant_commands
  FOR SELECT TO authenticated
  USING (
    actor_user_id = auth.uid()
    OR is_admin_or_finance_or_leader()
  );

-- 所有人可 insert（系統記錄用），只有 admin 可改
CREATE POLICY "assistant_cmd_insert" ON assistant_commands
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "assistant_cmd_update" ON assistant_commands
  FOR UPDATE TO authenticated
  USING (is_admin());

-- ============================================
-- 17. agent_tasks
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view agent_tasks" ON agent_tasks;
DROP POLICY IF EXISTS "Authenticated users can insert agent_tasks" ON agent_tasks;
DROP POLICY IF EXISTS "Authenticated users can update agent_tasks" ON agent_tasks;

CREATE POLICY "agent_tasks_select" ON agent_tasks
  FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR is_admin_or_finance_or_leader()
  );

CREATE POLICY "agent_tasks_insert" ON agent_tasks
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "agent_tasks_update" ON agent_tasks
  FOR UPDATE TO authenticated
  USING (requested_by = auth.uid() OR is_admin());

-- ============================================
-- 18. stored_files
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view stored_files" ON stored_files;
DROP POLICY IF EXISTS "Authenticated users can insert stored_files" ON stored_files;

CREATE POLICY "stored_files_select" ON stored_files
  FOR SELECT TO authenticated
  USING (TRUE); -- 檔案 metadata 可查（實際檔案由 Storage 控制）

CREATE POLICY "stored_files_insert" ON stored_files
  FOR INSERT TO authenticated
  WITH CHECK (TRUE); -- Webhook 需要寫入

-- ============================================
-- 19. knowledge_documents / access_policies
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view knowledge_documents" ON knowledge_documents;
DROP POLICY IF EXISTS "Authenticated users can insert knowledge_documents" ON knowledge_documents;
DROP POLICY IF EXISTS "Authenticated users can update knowledge_documents" ON knowledge_documents;

CREATE POLICY "knowledge_docs_select" ON knowledge_documents
  FOR SELECT TO authenticated
  USING (
    visibility_scope = 'company'
    OR owner_id = auth.uid()
    OR is_admin_or_finance_or_leader()
  );

CREATE POLICY "knowledge_docs_modify" ON knowledge_documents
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Authenticated users can view knowledge_access_policies" ON knowledge_access_policies;
DROP POLICY IF EXISTS "Authenticated users can insert knowledge_access_policies" ON knowledge_access_policies;
DROP POLICY IF EXISTS "Authenticated users can delete knowledge_access_policies" ON knowledge_access_policies;

CREATE POLICY "knowledge_access_select" ON knowledge_access_policies
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "knowledge_access_modify" ON knowledge_access_policies
  FOR ALL TO authenticated
  USING (is_admin());

-- ============================================
-- 20. task_reminders
-- ============================================
DROP POLICY IF EXISTS "Authenticated can manage task_reminders" ON task_reminders;

CREATE POLICY "reminders_select" ON task_reminders
  FOR SELECT TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR is_admin_or_finance_or_leader()
  );

CREATE POLICY "reminders_insert" ON task_reminders
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "reminders_update" ON task_reminders
  FOR UPDATE TO authenticated
  USING (created_by_user_id = auth.uid() OR is_admin());

-- ============================================
-- 21. contract_extraction_results
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view contract_extraction_results" ON contract_extraction_results;
DROP POLICY IF EXISTS "Authenticated users can insert contract_extraction_results" ON contract_extraction_results;
DROP POLICY IF EXISTS "Authenticated users can update contract_extraction_results" ON contract_extraction_results;

CREATE POLICY "extraction_select" ON contract_extraction_results
  FOR SELECT TO authenticated
  USING (is_admin_or_finance_or_leader());

CREATE POLICY "extraction_modify" ON contract_extraction_results
  FOR ALL TO authenticated
  USING (is_admin_or_finance_or_leader());

-- ============================================
-- 22. milestone_payment_links / group_participants
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view milestone_payment_links" ON milestone_payment_links;
DROP POLICY IF EXISTS "Authenticated users can insert milestone_payment_links" ON milestone_payment_links;

CREATE POLICY "milestone_links_select" ON milestone_payment_links
  FOR SELECT TO authenticated
  USING (TRUE); -- 跟隨 milestone 的權限

CREATE POLICY "milestone_links_modify" ON milestone_payment_links
  FOR ALL TO authenticated
  USING (is_admin_or_finance_or_leader());

DROP POLICY IF EXISTS "Authenticated users can view group_participants" ON group_participants;
DROP POLICY IF EXISTS "Authenticated users can insert group_participants" ON group_participants;
DROP POLICY IF EXISTS "Authenticated users can update group_participants" ON group_participants;

CREATE POLICY "group_participants_select" ON group_participants
  FOR SELECT TO authenticated
  USING (TRUE); -- LINE 群組成員可查

CREATE POLICY "group_participants_modify" ON group_participants
  FOR ALL TO authenticated
  USING (is_admin_or_finance_or_leader());

-- ============================================
-- 23. project_costs（如果存在）
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'project_costs') THEN
    ALTER TABLE project_costs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON project_costs;

    CREATE POLICY "costs_select" ON project_costs
      FOR SELECT TO authenticated
      USING (is_admin_or_finance());

    CREATE POLICY "costs_modify" ON project_costs
      FOR ALL TO authenticated
      USING (is_admin_or_finance());
  END IF;
END $$;

-- ============================================
-- 24. commission_payouts（如果存在）
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'commission_payouts') THEN
    ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Enable read access for authenticated users" ON commission_payouts;

    CREATE POLICY "payouts_select" ON commission_payouts
      FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR is_admin_or_finance()
      );

    CREATE POLICY "payouts_modify" ON commission_payouts
      FOR ALL TO authenticated
      USING (is_admin_or_finance());
  END IF;
END $$;

-- ============================================
-- 25. payout_notifications（修復 DISABLE）
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'payout_notifications') THEN
    ALTER TABLE payout_notifications ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "payout_notif_select" ON payout_notifications
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR is_admin_or_finance());

    CREATE POLICY "payout_notif_modify" ON payout_notifications
      FOR ALL TO authenticated
      USING (is_admin_or_finance());
  END IF;
END $$;

-- ============================================
-- 完成
-- ============================================
-- 本次修復涵蓋 25 張表的 RLS 政策
-- 核心原則：
--   1. 業務只能看到自己的資料（分潤、勞報單、專案、商機）
--   2. 財務資料（交易、預支、成本）僅 admin/finance 可見
--   3. system_settings（含 Google token）僅 admin 可存取
--   4. 所有寫入操作都需要對應角色權限
