# Pipeline Batch Report — 2026-04-03

## Input Documents

| # | Document | Role |
|---|----------|------|
| 1 | 公司內部系統架構分析報告.md | 現況架構分析 |
| 2 | 川輝科技內部系統升級需求分析與功能規劃.md | 升級需求（Track A + B） |
| 3 | 川輝科技公司內部系統整合升級規劃書.md | 整合規劃（Track A + B + C）— Master Document |

Doc 3 subsumes the others and was used as the single source of truth.

---

## Pipeline Results

### Pipeline 1: Database Schema Extension [PASS - 1 cycle]

**Session:** SESSION-20260403-001-db-schema
**Output:** `migrations/012_system_upgrade_v2.sql` (758 lines)

Created **18 new tables** covering:
- 合約管理: `contracts`, `contract_extraction_results`
- 里程碑與付款: `project_milestones`, `project_payment_schedules`, `milestone_payment_links`
- 保固與維護: `project_warranties`, `project_maintenance_plans`
- 分潤規則: `commission_rules`, `commission_events`
- 財務交易: `finance_transactions`, `payout_advance_records`
- 聯絡人: `contact_identities`, `group_participants`
- 檔案: `stored_files`
- AI 助理: `assistant_commands`, `agent_tasks`
- 知識文件: `knowledge_documents`, `knowledge_access_policies`

Includes: 82 indexes, 46 CHECK constraints, 60 COMMENT ON statements, 18 RLS enable + 52 RLS policies.

**Action Required:** Run this migration in Supabase SQL editor.

---

### Pipeline 2: Commission Engine Refactor [PASS - 1 cycle]

**Session:** SESSION-20260403-002-commission-refactor
**Output:** `utils/commissionEngineV2.js` (1,052 lines)

New event-based commission engine with 8 functions:
1. `calculateNetAmount()` — 未稅金額計算
2. `getCommissionRule()` — 取得分潤規則（支援 legacy fallback）
3. `createCommissionEvent()` — 建立分潤事件
4. `processAdvancePayout()` — 處理預支分潤
5. `offsetAdvanceFromCommission()` — FIFO 預支沖銷
6. `generateLaborReceiptFromEvent()` — 從事件產生勞報單
7. `getCommissionSummary()` — 分潤總覽
8. `autoProcessPayment()` — 收款自動處理入口

Key improvements:
- Commission based on **net-of-tax received** (not contract amount)
- Event-based transaction model (each payment → commission_event)
- Advance payout with FIFO offset
- **Bug fix:** Insurance 2.11% now only applies when amount ≥ 20,000 TWD
- Backward compatible — original `commissionPayoutManager.js` untouched

---

### Pipeline 3: PRD Generation [PASS - 1 cycle]

**Session:** SESSION-20260403-003-prd-generation
**Output:** `.pipeline/reports/PRD_v1.md` (85 KB)

Comprehensive PRD covering:
- Track A: 合約與帳務自動化
- Track B: 川輝AI助理強化
- Track C: AI Chat / AI Agent 操作層
- Data model, API specs, UI specs, priority matrix, risk analysis

---

### Pipeline 4: Contact Identity System [PASS - 1 cycle]

**Session:** SESSION-20260403-004-contact-identity
**Output:** 5 new files

| File | Lines | Purpose |
|------|-------|---------|
| `pages/contact-management.js` | 1,360 | 聯絡人身份管理頁面 (3 tabs) |
| `pages/api/contacts/index.js` | 198 | GET/POST/PUT API |
| `pages/api/contacts/[id].js` | ~100 | GET/DELETE 單筆 API |
| `pages/api/contacts/bind.js` | 154 | LINE 身份綁定 API |

Features:
- 3-tab interface: 所有聯絡人 / 待確認 / 群組成員
- Search, filter by identity type
- Add/edit modal with employee binding
- Identity type badges (employee/client/vip/vendor/po/unknown)
- Permission gated (admin/leader/finance only)
- Responsive inline styles

---

## Build Verification

**`npm run build`: PASS** — All pages compile successfully, no errors.

---

## Summary

| Pipeline | Status | Cycles | New Files | Lines |
|----------|--------|--------|-----------|-------|
| DB Schema | PASS | 1 | 1 | 758 |
| Commission Engine | PASS | 1 | 1 | 1,052 |
| PRD Document | PASS | 1 | 1 | ~2,000 |
| Contact Identity | PASS | 1 | 4 | ~1,812 |
| **Total** | **ALL PASS** | — | **7** | **~5,622** |

## Next Steps

1. **Run migration** `012_system_upgrade_v2.sql` in Supabase SQL editor
2. **Wire up** commission engine V2 to payment recording pages
3. **Add nav entry** for contact management (e.g., in settings page or as new nav item)
4. **Start Track B/C** implementation: AI Chat interface, LINE assistant commands
5. **Review PRD** at `.pipeline/reports/PRD_v1.md` for detailed specs
