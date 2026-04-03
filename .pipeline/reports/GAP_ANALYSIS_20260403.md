# 差距分析報告 — 2026-04-03

## 對照三份規劃文件 vs 已完成項目

### 主軸 A：合約與帳務自動化

| 需求項目 | 狀態 | 說明 |
|---------|------|------|
| 合約上傳 → AI 抽取 → 人工確認建案 | ✅ 完成 | analyze-proposal.js + contract-confirm.js |
| 付款期程自動建立 | ✅ 完成 | contract-confirm.js 會建立 project_payment_schedules |
| 驗收里程碑自動建立 | ✅ 完成 | contract-confirm.js 會建立 project_milestones |
| 保固條件自動建立 | ✅ 完成 | contract-confirm.js 會建立 project_warranties |
| 維護費計畫自動建立 | ✅ 完成 | contract-confirm.js 會建立 project_maintenance_plans |
| 未稅實收分潤計算引擎 | ✅ 完成 | commissionEngineV2.js |
| 事件型交易模型 | ✅ 完成 | commission_events + finance_transactions |
| 預支分潤 + 沖銷邏輯 | ✅ 完成 | commissionEngineV2.js (processAdvancePayout + offsetAdvance) |
| 勞報單自動產生 | ✅ 完成 | commissionEngineV2.js (generateLaborReceiptFromEvent) |
| 付款頁面串接 V2 引擎 | ✅ 完成 | payments.js 已 import autoProcessPayment |
| **專案詳情頁顯示里程碑/付款期程/保固/維護** | ❌ 缺 | projects/[id].js 仍用舊資料結構 |
| **財務頁面支援預支/額外款項/finance_transactions** | ❌ 缺 | finance.js 沒有新表的 UI |
| **儀表板顯示里程碑進度/付款排程** | ❌ 缺 | dashboard.js 沒查新表 |
| **保固到期提醒 + 維護費自動啟動** | ❌ 缺 | 沒有 Cron 或自動邏輯 |
| **分潤中心 — 顯示未稅收款/應計/預支/已發** | ❌ 缺 | 沒有整合的分潤中心頁 |

### 主軸 B：川輝AI助理強化

| 需求項目 | 狀態 | 說明 |
|---------|------|------|
| 聯絡人身份主檔 + 後台管理 | ✅ 完成 | contact-management.js + API |
| 手動綁定 LINE 成員到員工/VIP/客戶 | ✅ 完成 | contacts/bind.js API |
| **LINE Webhook 整合 stored_files（保存原始檔名）** | ❌ 缺 | webhook.js 沒更新 |
| **LINE Webhook 整合 contact_identities（身份識別）** | ❌ 缺 | webhook.js 沒更新 |
| **群組內建立 Google Meet 會議** | ❌ 缺 | 需要 Google Calendar API 整合 |
| **群組內取回過期檔案** | ❌ 缺 | 需要 reply message → stored_files 映射 |
| **群組知識問答** | ❌ 缺 | 需要整合 RAG + 群組歷史 |
| **群組內直接綁定 Email** | ❌ 缺 | 需要 LINE 指令解析 |
| **會議提醒（前一天 + 前一小時）** | ❌ 缺 | 現有 Cron 只做每日 08:00 |

### 主軸 C：AI Chat / AI Agent 操作層

| 需求項目 | 狀態 | 說明 |
|---------|------|------|
| AI Chat 查詢介面 | ✅ 完成 | ai-chat.js + api/ai-chat.js |
| AI Chat 快速操作 | ✅ 完成 | 有快捷按鈕 |
| AI Chat 串流回應 | ✅ 完成 | SSE streaming |
| **AI Agent 可操作系統（建案/更新/建任務）** | ❌ 缺 | 目前只能查詢，不能執行操作 |
| **操作確認流程（顯示待確認 → 用戶確認 → 執行）** | ❌ 缺 | |
| **權限分級（查詢/產生/修改/財務/刪除）** | ❌ 缺 | |
| **稽核紀錄寫入 assistant_commands** | ❌ 缺 | |
| **業務售前提案生成（從知識庫）** | ❌ 缺 | 基本 RAG 有，但沒整合到 Chat |
| **川輝AI助理 LINE + Web 共用 Agent 核心** | ❌ 缺 | |

### 基礎設施

| 需求項目 | 狀態 | 說明 |
|---------|------|------|
| 18 張新資料表 | ✅ 完成 | migration 012 已執行 |
| RLS 政策 | ✅ 完成 | 基礎 authenticated 政策 |
| 文件解析強化（掃描PDF/圖片/大檔案） | ✅ 完成 | documentParser.js |
| **操作稽核 (audit log)** | ❌ 缺 | 表已建，邏輯未寫 |
| **失敗監控（Cron/Webhook/AI）** | ❌ 缺 | |
| **RLS 細化（角色級權限）** | ❌ 缺 | 目前是全 authenticated 可讀寫 |

---

## 優先順序建議

### P1 — 立刻該做（直接影響日常使用）

1. **專案詳情頁升級** — 顯示里程碑進度、付款期程、保固/維護狀態
2. **財務頁面升級** — 支援預支、finance_transactions 檢視、分潤中心
3. **LINE Webhook 更新** — 保存原始檔名到 stored_files + 識別發送者身份

### P2 — 高價值功能

4. **AI Agent 操作能力** — 讓 Chat 能建案、更新狀態、建任務
5. **群組 Google Meet 建立** — 需要 Google Calendar API
6. **保固到期 + 維護費啟動 Cron**

### P3 — 完善與進階

7. 群組知識問答
8. 群組取回過期檔案
9. LINE 指令綁定 Email
10. 稽核紀錄 + 操作監控
