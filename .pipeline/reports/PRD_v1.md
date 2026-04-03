# 川輝科技內部系統升級 PRD v1.0

## 文件資訊

| 項目 | 內容 |
|------|------|
| 文件版本 | v1.0 |
| 建立日期 | 2026-04-03 |
| 文件狀態 | 初版草案 (Draft) |
| 適用範圍 | 川輝科技業務分潤管理系統升級 |
| 技術基底 | Next.js 14.2.3 (Pages Router) + Supabase + Vercel |
| 參考文件 | 公司內部系統架構分析報告、川輝科技內部系統升級需求分析與功能規劃、川輝科技公司內部系統整合升級規劃書 |

---

## 1. 產品願景與目標

### 1.1 產品願景

將川輝科技現有的業務分潤管理系統，從「記錄型內部平台」升級為「可執行的營運中台 + 群組智能助理 + 知識化 AI Agent 平台」。系統將具備三重身份：第一，作為營運中台，能將合約、付款、分潤、勞報單與維護計畫自動串接；第二，作為群組工作助理，讓川輝AI助理在 LINE 中能辨識身份、建立會議、取回檔案與回答問題；第三，作為知識化 AI Agent 平台，讓內部使用者與業務均能透過自然語言操作系統、生成提案、討論規格，並共享公司累積的知識資產。

### 1.2 可量化成功指標

| 指標 | 目標值 | 衡量方式 |
|------|--------|----------|
| 建案耗時降低 | 從平均 30 分鐘降至 5 分鐘以內（含人工確認） | 統計從上傳合約到專案建立完成的平均時間 |
| 分潤計算正確率 | 100%（未稅實收自動計算零人工介入錯誤） | 抽查每月分潤計算結果與人工複核比對 |
| AI 助理指令執行成功率 | MVP 階段達 85% 以上 | 統計 `assistant_commands` 表中成功率 |

---

## 2. 升級範圍定義

### 2.1 MVP 範圍 (Phase 1)

| 模組 | MVP 功能 |
|------|----------|
| 合約建案 | 上傳提案書/合約後，AI 自動抽取主要欄位，進入人工確認建案流程 |
| 付款與驗收 | 自動建立付款期程（支援任意比例）與驗收里程碑 |
| 分潤引擎 | 依每筆客戶實收未稅金額自動計算分潤，支援每案自訂分潤率 |
| 勞報單 | 正常分潤與預支發放時自動產生勞報單，含稅額與健保費自動計算 |
| 簡易記帳 | 支援額外款項與發包款項的簡易記帳 |
| 身份補正 | 後台手動綁定 LINE 成員為內部人員/VIP/客戶，補充 Email 等聯絡資訊 |
| 檔名還原 | 儲存並還原檔案原始檔名 |
| LINE 會議建立 | 群組內透過指令建立 Google Meet 會議並回傳連結 |
| AI Chat 基礎版 | 系統內建 AI Chat 介面，支援查詢、摘要與生成提案草稿 |
| 川輝AI助理售前版 | 業務可透過 LINE 或 AI Chat 查詢歷史提案、產出提案初稿 |

### 2.2 完整版範圍 (Phase 2)

| 模組 | 完整版新增功能 |
|------|----------------|
| 合約理解進階 | 支援附約、補充條款、多版本比對、複雜條件抽取 |
| 維護費自動化 | 保固期滿自動建立維護收入與提醒 |
| 財務彈性化 | 支援多人分潤、補差額、跨期調整、更多特例場景 |
| LINE 取回檔案 | 回覆歷史訊息後自動從雲端重傳檔案至群組 |
| 群組知識問答 | 回答歷史決策、待辦、文件依據，並附出處來源 |
| 群組內補綁資訊 | 在 LINE 群組直接綁定 Email、角色、VIP 標記 |
| AI Agent 進階版 | 可跨模組規劃、補問、確認後執行更多操作 |
| 川輝AI助理全功能版 | 與內部系統 Agent 共用能力核心 |
| 提案與規格協作工作台 | 提案版本管理、討論紀錄、多人協作修訂 |

### 2.3 明確排除項目

| 排除項目 | 原因 |
|----------|------|
| 遷移至 Next.js App Router | 升級風險高且不影響業務功能，留待未來獨立評估 |
| 對外客戶入口 / 客戶自助平台 | 本次升級聚焦內部營運，不對外開放 |
| 完整 ERP / 會計系統 | 僅做簡易記帳與分潤帳務，不替代正式會計軟體 |
| 自動發放款項 / 銀行串接 | 分潤發放仍需財務人工審核，不做自動匯款 |
| 多語系支援 | 系統 UI 僅支援繁體中文 |
| 自建 LINE Bot 框架 | 繼續使用既有 LINE Messaging API + Webhook 架構 |

---

## 3. 主軸 A：合約與帳務自動化

### 3.1 使用者故事 (User Stories)

| ID | 角色 | 故事 | 價值 |
|----|------|------|------|
| A-01 | 業務/PM | 作為業務，我希望上傳最終提案書與合約後，系統能自動抽取專案資訊並建立案件 | 以便大幅減少手動輸入時間，避免人工遺漏或錯誤 |
| A-02 | 業務/PM | 作為 PM，我希望系統自動建立付款期程與驗收里程碑 | 以便我能直接追蹤專案進度與收款狀態 |
| A-03 | 財務 | 作為財務人員，我希望每筆客戶付款登錄後系統自動計算未稅分潤 | 以便確保分潤金額正確且可追溯計算依據 |
| A-04 | 財務 | 作為財務人員，我希望分潤發放時自動產生勞報單並計算稅額 | 以便省去手動計算與製單的重複工作 |
| A-05 | 管理者 | 作為管理者，我希望系統支援預支分潤與後續沖銷 | 以便處理業務中途預支的實務需求 |
| A-06 | 管理者 | 作為管理者，我希望能記錄額外款項與發包支出 | 以便完整掌握每個專案的資金流向 |
| A-07 | PM | 作為 PM，我希望合約建案時能自動辨識保固與維護費條件 | 以便後續自動追蹤保固到期與維護費啟動 |

### 3.2 功能需求規格

#### 3.2.1 合約上傳與 AI 抽取

**功能描述**：使用者上傳最終版提案書或合約 PDF/Word 檔案，系統透過 AI 解析文件內容，抽取結構化商務資訊，並以暫存結果呈現供人工確認。

**驗收標準**：
- AC-01: 支援 PDF 與 Word (.docx) 格式上傳，單檔不超過 20MB
- AC-02: AI 抽取結果包含：客戶名稱、專案名稱、合約總額、是否含稅、稅率、付款期數與各期比例、驗收節點、保固天數、維護費條件
- AC-03: 每個抽取欄位附帶信心分數 (0~1)，信心 < 0.7 的欄位以醒目色標示
- AC-04: 抽取結果寫入 `contract_extraction_results` 表，不直接寫入正式資料表
- AC-05: 抽取失敗時顯示錯誤訊息並允許手動輸入

**資料模型**：

```
contract_extraction_results
├── id: UUID (PK)
├── uploaded_by: UUID (FK → users.id)
├── file_id: UUID (FK → project_documents.id)
├── raw_text: TEXT                    -- 解析後的原始文字
├── raw_json: JSONB                   -- AI 回傳的原始 JSON
├── normalized_json: JSONB            -- 標準化後的結構化資料
├── confidence_scores: JSONB          -- 各欄位信心分數
├── status: VARCHAR(20)               -- pending / reviewed / confirmed / rejected
├── reviewed_by: UUID (FK → users.id)
├── review_notes: TEXT
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ
```

`normalized_json` 結構範例：

```json
{
  "client_name": "某某科技股份有限公司",
  "project_name": "官方網站重建專案",
  "contract_amount": 630000,
  "tax_included": true,
  "tax_rate": 0.05,
  "currency": "TWD",
  "signed_date": "2026-03-15",
  "payment_terms": [
    { "sequence": 1, "percentage": 30, "condition": "簽約後 7 日內", "description": "簽約款" },
    { "sequence": 2, "percentage": 40, "condition": "初版驗收通過後", "description": "期中款" },
    { "sequence": 3, "percentage": 30, "condition": "正式上線驗收後", "description": "尾款" }
  ],
  "milestones": [
    { "title": "需求確認", "criteria": "需求文件雙方簽認", "estimated_date": null },
    { "title": "初版交付", "criteria": "甲方書面確認初版功能", "estimated_date": null },
    { "title": "正式上線", "criteria": "甲方正式驗收簽章", "estimated_date": null }
  ],
  "warranty": { "days": 30, "start_trigger": "final_acceptance", "scope": "功能性瑕疵修復" },
  "maintenance": { "enabled": true, "monthly_fee": 5000, "start_rule": "warranty_end" },
  "contacts": [
    { "name": "王小明", "title": "專案經理", "email": "wang@example.com", "phone": "0912345678" }
  ]
}
```

**API 規格**：

```
POST /api/contracts/extract
Request:
  Content-Type: multipart/form-data
  Body: { file: File, document_type: "proposal" | "contract" }
Response (200):
  {
    "extraction_id": "uuid",
    "normalized_json": { ... },
    "confidence_scores": { "client_name": 0.95, "contract_amount": 0.88, ... },
    "status": "pending"
  }
Response (422):
  { "error": "文件解析失敗", "detail": "..." }
```

#### 3.2.2 人工確認建案

**功能描述**：在 AI 抽取結果基礎上，使用者在一頁式確認畫面中檢視、修正各欄位，確認後一鍵建立專案及所有關聯資料。

**驗收標準**：
- AC-06: 確認頁面以表單呈現所有抽取欄位，低信心欄位（< 0.7）以橙色底色標示
- AC-07: 使用者可修改任意欄位，修改記錄保留於 `review_notes`
- AC-08: 確認送出後，系統一次性建立：project、project_payment_schedules、project_milestones、milestone_payment_links、project_warranties、project_maintenance_plans、commission_rules
- AC-09: 建案成功後自動導向專案詳情頁 `/projects/[id]`
- AC-10: 確認頁面顯示「分潤預覽」區塊，依設定的分潤率預覽各期應計分潤

**API 規格**：

```
POST /api/contracts/confirm
Request:
  {
    "extraction_id": "uuid",
    "confirmed_data": { ... },  // 使用者修正後的完整資料
    "commission_rate": 0.25,
    "assigned_to": "user_uuid"
  }
Response (200):
  {
    "project_id": "uuid",
    "message": "專案建立成功",
    "created_entities": {
      "payment_schedules": 3,
      "milestones": 3,
      "warranty": true,
      "maintenance_plan": true
    }
  }
```

#### 3.2.3 付款期程與驗收里程碑

**功能描述**：專案建立後，系統自動建立付款期程與驗收里程碑，支援驗收與付款的綁定關係。

**驗收標準**：
- AC-11: 付款期程支援任意期數與任意比例（非固定模板）
- AC-12: 每期付款可綁定一個或多個驗收里程碑作為觸發條件
- AC-13: 付款期程頁面以時間軸或表格方式呈現，可手動新增/修改/刪除期數
- AC-14: 驗收里程碑狀態可更新為：pending / in_progress / completed / accepted
- AC-15: 驗收完成時系統自動檢查是否觸發對應付款期

**資料模型**：

```
project_payment_schedules
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id)
├── sequence_no: INTEGER
├── percentage: DECIMAL(5,2)
├── gross_amount: DECIMAL(12,2)         -- 含稅金額
├── net_amount: DECIMAL(12,2)           -- 未稅金額 = gross / (1 + tax_rate)
├── trigger_type: VARCHAR(30)           -- milestone / date / manual
├── trigger_description: TEXT
├── status: VARCHAR(20)                 -- pending / invoiced / paid
├── expected_date: DATE
├── actual_paid_date: DATE
├── actual_paid_amount: DECIMAL(12,2)
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ

project_milestones
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id)
├── title: VARCHAR(255)
├── description: TEXT
├── acceptance_criteria: TEXT
├── due_date: DATE
├── completed_date: DATE
├── status: VARCHAR(20)                 -- pending / in_progress / completed / accepted
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ

milestone_payment_links
├── id: UUID (PK)
├── milestone_id: UUID (FK → project_milestones.id)
├── payment_schedule_id: UUID (FK → project_payment_schedules.id)
├── created_at: TIMESTAMPTZ
└── UNIQUE (milestone_id, payment_schedule_id)
```

#### 3.2.4 保固與維護費

**功能描述**：系統儲存每案的保固條件與維護費規則，保固到期時自動提醒，維護費依規則自動起算。

**驗收標準**：
- AC-16: 支援四種情境：有保固+有維護、有保固+無維護、無保固+有維護、無保固+無維護
- AC-17: 保固起算條件支援：final_acceptance（最終驗收後）、specific_date（指定日期）
- AC-18: 保固到期前 7 天與當天發送提醒通知
- AC-19: (Phase 2) 維護費起算後自動建立週期性帳單追蹤

**資料模型**：

```
project_warranties
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id)
├── warranty_days: INTEGER
├── start_trigger: VARCHAR(30)          -- final_acceptance / specific_date
├── start_date: DATE
├── end_date: DATE
├── scope: TEXT
├── status: VARCHAR(20)                 -- inactive / active / expired
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ

project_maintenance_plans
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id)
├── enabled: BOOLEAN DEFAULT false
├── start_rule: VARCHAR(30)             -- warranty_end / specific_date / project_close
├── start_date: DATE
├── monthly_fee: DECIMAL(10,2)
├── billing_cycle: VARCHAR(20)          -- monthly / quarterly / annually
├── status: VARCHAR(20)                 -- inactive / active / suspended
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ
```

### 3.3 合約抽取建案流程

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          合約抽取建案流程                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  使用者                     系統                          資料庫              │
│    │                         │                              │                │
│    │  1. 上傳合約/提案書      │                              │                │
│    │ ──────────────────────► │                              │                │
│    │                         │  2. 呼叫 /api/documents/parse │                │
│    │                         │  解析 PDF/Word → 純文字       │                │
│    │                         │                              │                │
│    │                         │  3. 呼叫 Claude AI            │                │
│    │                         │  抽取結構化商務條款            │                │
│    │                         │                              │                │
│    │                         │  4. 標準化結果 + 信心評分      │                │
│    │                         │ ────────────────────────────►│                │
│    │                         │  寫入 contract_extraction_results               │
│    │                         │                              │                │
│    │  5. 顯示抽取結果預覽    │                              │                │
│    │ ◄────────────────────── │                              │                │
│    │  (低信心欄位醒目標示)    │                              │                │
│    │                         │                              │                │
│    │  6. 人工修正 + 確認      │                              │                │
│    │ ──────────────────────► │                              │                │
│    │                         │  7. 一次性建立:               │                │
│    │                         │  ├─ contracts (合約主檔)      │                │
│    │                         │  ├─ projects (專案)           │                │
│    │                         │  ├─ payment_schedules (付款期)│                │
│    │                         │  ├─ milestones (驗收點)       │                │
│    │                         │  ├─ milestone_payment_links   │                │
│    │                         │  ├─ warranties (保固)         │                │
│    │                         │  ├─ maintenance_plans (維護)  │                │
│    │                         │  └─ commission_rules (分潤規則)│               │
│    │                         │ ────────────────────────────►│                │
│    │                         │                              │                │
│    │  8. 導向專案詳情頁       │                              │                │
│    │ ◄────────────────────── │                              │                │
│    │                         │                              │                │
│    │                         │  9. 後續自動化:               │                │
│    │                         │  客戶付款 → 計算分潤           │                │
│    │                         │  → 產生勞報單 → 通知簽回       │                │
│    │                         │  驗收完成 → 觸發對應付款期      │                │
│    │                         │  保固到期 → 啟動維護計畫        │                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 分潤計算規則 (Net-of-Tax)

#### 核心規則

分潤必須依**客戶實際付款的未稅金額**計算，不是依合約總額或含稅金額。

**公式**：

```
未稅實收金額 = 客戶含稅付款金額 ÷ (1 + 稅率)
本次應計分潤 = 未稅實收金額 × 該案分潤率
本次可發放   = 本次應計分潤 - 該案尚未沖銷的預支金額
```

**預設參數**：
- 稅率：5%（營業稅，可依案調整）
- 預設分潤率：25%（每案可覆寫）

#### 計算範例

**範例一：標準分潤**

```
某案合約總額：630,000 (含稅)
分潤率：25%
第一期收款比例：30%

客戶第一期付款：630,000 × 30% = 189,000 (含稅)
未稅金額：189,000 ÷ 1.05 = 180,000
應計分潤：180,000 × 25% = 45,000

勞報單計算：
  毛額：45,000
  扣繳稅 (10%)：4,500
  二代健保 (2.11%, 因 ≥ 20,000)：949 (取至整數：950)
  實發金額：45,000 - 4,500 - 950 = 39,550
```

**範例二：含預支沖銷**

```
同上案件，業務已預支 20,000 元

客戶第一期付款：189,000 (含稅)
未稅金額：180,000
應計分潤：180,000 × 25% = 45,000
待沖銷預支：20,000
本次可發放：45,000 - 20,000 = 25,000

勞報單計算（以可發放 25,000 計）：
  毛額：25,000
  扣繳稅 (10%)：2,500
  二代健保 (2.11%, 因 ≥ 20,000)：528 (取至整數：528)
  實發金額：25,000 - 2,500 - 528 = 21,972
```

**範例三：多期累計**

```
第二期收款：630,000 × 40% = 252,000 (含稅)
未稅金額：252,000 ÷ 1.05 = 240,000
應計分潤：240,000 × 25% = 60,000
此時預支已於第一期全額沖銷
本次可發放：60,000
```

#### 資料模型

```
commission_rules
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id)
├── user_id: UUID (FK → users.id)
├── commission_rate: DECIMAL(5,4)       -- e.g. 0.2500
├── basis_type: VARCHAR(20)             -- net_of_tax (固定為未稅)
├── tax_rate: DECIMAL(5,4)              -- e.g. 0.0500
├── notes: TEXT
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ

commission_events
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id)
├── user_id: UUID (FK → users.id)
├── payment_schedule_id: UUID (FK → project_payment_schedules.id)
├── gross_received: DECIMAL(12,2)       -- 客戶含稅付款金額
├── tax_rate: DECIMAL(5,4)
├── net_received: DECIMAL(12,2)         -- 未稅金額
├── commission_rate: DECIMAL(5,4)
├── calculated_commission: DECIMAL(12,2) -- 應計分潤
├── advance_offset: DECIMAL(12,2)       -- 本次沖銷預支金額
├── payable_amount: DECIMAL(12,2)       -- 本次可發放金額
├── status: VARCHAR(20)                 -- calculated / approved / paid
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ

payout_advance_records
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id)
├── user_id: UUID (FK → users.id)
├── advance_amount: DECIMAL(12,2)
├── offset_amount: DECIMAL(12,2)        -- 已沖銷金額
├── remaining_amount: DECIMAL(12,2)     -- 剩餘待沖銷
├── offset_status: VARCHAR(20)          -- pending / partial / fully_offset
├── reason: TEXT
├── approved_by: UUID (FK → users.id)
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ

finance_transactions
├── id: UUID (PK)
├── project_id: UUID (FK → projects.id)
├── user_id: UUID (FK → users.id)        -- 可為 NULL（非人員相關交易）
├── transaction_type: VARCHAR(30)        -- client_payment / commission_payout / advance_payout / bonus / outsource_expense / maintenance_income
├── amount: DECIMAL(12,2)
├── currency: VARCHAR(3) DEFAULT 'TWD'
├── needs_labor_receipt: BOOLEAN DEFAULT false
├── reference_type: VARCHAR(50)          -- commission_event / payout_advance / manual
├── reference_id: UUID
├── description: TEXT
├── status: VARCHAR(20)                  -- draft / confirmed / completed
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ
```

### 3.5 勞報單自動化流程

```
┌──────────────────────────────────────────────────────────────────┐
│                      勞報單自動化流程                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                                │
│  │ 觸發來源     │                                                │
│  │ ├─正常分潤發放│                                                │
│  │ └─分潤預支   │                                                │
│  └──────┬───────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────┐                                │
│  │ 計算勞報單金額                │                                │
│  │ 毛額 = 可發放金額             │                                │
│  │ 扣繳稅 = 毛額 × 10%          │                                │
│  │ 健保費 = 毛額 × 2.11%        │ (僅 ≥ 20,000 元)              │
│  │ 實發 = 毛額 - 扣繳稅 - 健保費 │                                │
│  └──────┬───────────────────────┘                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────┐                                │
│  │ 自動建立勞報單記錄            │                                │
│  │ 帶入：業務姓名、專案名稱、    │                                │
│  │   開立日期、勞務期間、         │                                │
│  │   委託單位、各項金額          │                                │
│  │ 狀態：draft                   │                                │
│  └──────┬───────────────────────┘                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────┐                                │
│  │ 通知業務                      │                                │
│  │ ├─站內通知                    │                                │
│  │ └─(選用) Email 通知           │                                │
│  └──────┬───────────────────────┘                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────┐                                │
│  │ 業務下載 PDF                  │                                │
│  │ (含空白欄位供手寫填寫)        │                                │
│  │ 狀態：issued → downloaded     │                                │
│  └──────┬───────────────────────┘                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────┐                                │
│  │ 簽回歸檔                      │                                │
│  │ 上傳簽回掃描檔或標記完成       │                                │
│  │ 狀態：completed               │                                │
│  └──────┬───────────────────────┘                                │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────┐                                │
│  │ 財務確認入帳                  │                                │
│  │ 標記已付款 / 已歸檔           │                                │
│  │ 寫入 finance_transactions     │                                │
│  └──────────────────────────────┘                                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 主軸 B：川輝AI助理強化

### 4.1 使用者故事

| ID | 角色 | 故事 | 價值 |
|----|------|------|------|
| B-01 | 管理者 | 作為管理者，我希望能在後台手動將 LINE 群組成員綁定為內部員工、VIP 客戶或專案窗口 | 以便 AI 助理能正確辨識身份並提供對應服務 |
| B-02 | PM | 作為 PM，我希望在 LINE 群組下載檔案時看到原始檔名 | 以便快速找到正確的文件而不需逐一打開確認 |
| B-03 | 業務 | 作為業務，我希望在 LINE 群組中直接用指令建立 Google Meet 會議 | 以便不需切換到其他工具即可完成會議安排 |
| B-04 | 使用者 | 作為使用者，我希望在 LINE 過期的檔案連結上回覆請助理重傳 | 以便取回需要的檔案而不需手動到系統後台搜尋 |
| B-05 | 使用者 | 作為使用者，我希望在群組中問川輝AI助理過去討論的結論 | 以便快速查閱歷史決策而不需翻閱大量訊息 |
| B-06 | 管理者 | 作為管理者，我希望能在群組中直接指令綁定成員 Email | 以便在現場即時補充聯絡資訊而不需回到後台 |

### 4.2 身份辨識與後台管理

**功能描述**：建立聯絡人與身份主檔 (`contact_identities`)，將 LINE 群組成員的身份、聯絡方式、角色標籤統一管理。支援後台人工綁定與群組指令兩種入口。

**驗收標準**：
- AC-20: 建立 `contact_identities` 表作為聯絡人主檔，支援內部員工、客戶、VIP、廠商等多種身份類型
- AC-21: 後台身份管理頁面可依群組、姓名、LINE 顯示名稱搜尋與篩選
- AC-22: 手動綁定的身份優先級高於 AI 自動推論結果
- AC-23: 同一 LINE ID 可在不同群組標記不同角色（例如在 A 群組是客戶，在 B 群組是協力廠商）
- AC-24: 後台可編輯：姓名、公司、角色、Email、電話、備註、標籤、VIP 標記

**資料模型**：

```
contact_identities
├── id: UUID (PK)
├── line_user_id: VARCHAR(100)          -- LINE UID
├── display_name: VARCHAR(255)          -- LINE 顯示名稱
├── real_name: VARCHAR(255)
├── company: VARCHAR(255)
├── identity_type: VARCHAR(30)          -- employee / client / vip / vendor / partner / unknown
├── email: VARCHAR(255)
├── phone: VARCHAR(50)
├── internal_user_id: UUID (FK → users.id)  -- 若為內部員工
├── is_vip: BOOLEAN DEFAULT false
├── tags: TEXT[]                         -- 自訂標籤
├── notes: TEXT
├── source: VARCHAR(20)                 -- manual / ai_inferred / line_login
├── manually_verified: BOOLEAN DEFAULT false
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ

group_participants
├── id: UUID (PK)
├── line_group_id: VARCHAR(100)         -- LINE 群組 ID
├── identity_id: UUID (FK → contact_identities.id)
├── role_in_group: VARCHAR(30)          -- owner / admin / member / observer
├── label: VARCHAR(100)                 -- 群組內角色標記 (PM / 客戶窗口 / 技術負責等)
├── manually_verified: BOOLEAN DEFAULT false
├── joined_at: TIMESTAMPTZ
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ
```

**API 規格**：

```
GET  /api/identities?search=xxx&group_id=xxx&type=xxx
POST /api/identities                    -- 新增/更新身份
PUT  /api/identities/:id                -- 編輯身份
POST /api/identities/bind               -- 手動綁定 LINE 成員
GET  /api/groups/:group_id/participants -- 取得群組成員列表
```

### 4.3 檔案原始檔名還原

**功能描述**：在儲存 LINE 群組檔案時，同時保存原始檔名、MIME 類型與來源訊息映射。下載時以原始檔名輸出。

**驗收標準**：
- AC-25: `stored_files` 表儲存 `storage_key`（雲端唯一鍵）與 `original_file_name`（原始檔名）分離
- AC-26: LINE Webhook 收到檔案時自動擷取原始檔名（從 LINE API `fileName` 欄位）
- AC-27: 前端下載檔案時使用 `original_file_name` 作為輸出檔名
- AC-28: 既有檔案若有原始檔名資訊可透過回溯腳本補齊

**資料模型**：

```
stored_files
├── id: UUID (PK)
├── storage_key: VARCHAR(500)           -- Supabase Storage 物件鍵
├── original_file_name: VARCHAR(500)
├── file_extension: VARCHAR(20)
├── mime_type: VARCHAR(100)
├── file_size: BIGINT                   -- bytes
├── source_message_id: VARCHAR(100)     -- 對應 LINE 訊息 ID
├── source_group_id: VARCHAR(100)       -- 對應 LINE 群組 ID
├── uploaded_by_identity_id: UUID (FK → contact_identities.id)
├── public_url: TEXT
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ
```

### 4.4 Google Meet 會議建立指令

**功能描述**：使用者在 LINE 群組中透過自然語言或結構化指令請川輝AI助理建立 Google Meet 會議。系統解析時間、辨識參與者、建立行事曆事件、回傳連結並安排提醒。

**驗收標準**：
- AC-29: 支援以下指令格式：
  - `/建立會議 4/13 15:00~16:00 所有人`
  - `@川輝AI助理 幫我建立下周三會議 15:00 邀請 @A @B`
- AC-30: 支援絕對日期（4/13）與相對日期（下周三、明天、後天）
- AC-31: 解析完成後先回覆確認訊息，包含：日期、時間、參與者清單
- AC-32: 使用 Google Calendar API 建立 Event + Meet 連結
- AC-33: 有 Email 的參與者自動加入 Calendar 邀請
- AC-34: 會議建立成功後回傳 Meet 連結至群組
- AC-35: 前一天 09:00 與前一小時於群組發送提醒（含 Meet 連結）

**處理架構（四層）**：

```
指令解析層:  解析日期、時間、時長、參與者、標題
    │
    ▼
身份映射層:  從 @mention 或「所有人」找到 contact_identities + Email
    │
    ▼
會議建立層:  Google Calendar API → 建立 Event + Meet 連結
    │
    ▼
通知層:      群組回傳連結 + 寄出 Calendar 邀請 + 建立提醒任務
```

**資料模型**：

```
meeting_jobs
├── id: UUID (PK)
├── line_group_id: VARCHAR(100)
├── requested_by_identity_id: UUID (FK → contact_identities.id)
├── title: VARCHAR(255)
├── meeting_date: DATE
├── start_time: TIME
├── end_time: TIME
├── timezone: VARCHAR(50) DEFAULT 'Asia/Taipei'
├── google_event_id: VARCHAR(255)
├── meet_url: TEXT
├── participants: JSONB                 -- [{ identity_id, email, invited }]
├── reminder_status: JSONB              -- { day_before: sent/pending, hour_before: sent/pending }
├── status: VARCHAR(20)                 -- created / confirmed / cancelled
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ
```

**API 規格**：

```
POST /api/meetings/create-google-meet
Request:
  {
    "group_id": "LINE_GROUP_ID",
    "title": "專案週會",
    "date": "2026-04-13",
    "start_time": "15:00",
    "end_time": "16:00",
    "participants": ["all"] | ["identity_uuid_1", "identity_uuid_2"],
    "requested_by": "identity_uuid"
  }
Response (200):
  {
    "meet_url": "https://meet.google.com/xxx-xxx-xxx",
    "event_id": "google_event_id",
    "invited_count": 5,
    "no_email_count": 2
  }
```

### 4.5 過期檔案取回

**功能描述**：當 LINE 群組中的原始檔案連結已過期（超過 7 天），使用者可回覆該訊息並 @川輝AI助理，系統從 Supabase Storage 取回檔案並重傳至群組。

**驗收標準**：
- AC-36: 使用者回覆含附件的歷史訊息並 @川輝AI助理 即可觸發取回
- AC-37: 系統透過 reply message → source message ID → stored_files 映射找到雲端檔案
- AC-38: 確認操作者屬於該群組且有權限
- AC-39: 從 Supabase Storage 讀取檔案並透過 LINE Messaging API 重新傳送
- AC-40: 若找不到對應檔案，回覆「找不到該檔案的備份」

**處理流程**：

```
使用者回覆歷史訊息 + @川輝AI助理
         │
         ▼
Webhook 接收 → 取得 replyToken + quotedMessageId
         │
         ▼
查詢 line_messages → 找到 source_message_id
         │
         ▼
查詢 stored_files → 找到 storage_key + original_file_name
         │
         ▼
從 Supabase Storage 下載 → 透過 LINE API 傳送至群組
         │
         ▼
群組收到檔案（原始檔名）
```

### 4.6 群組知識問答

**功能描述**：川輝AI助理可回答本群組過去討論的內容，包括歷史決策、待辦事項、會議結論等。回答時附帶資訊來源。

**驗收標準**：
- AC-41: 支援以下類型提問：
  - 「這個問題之前有討論過嗎？」
  - 「上次會議決議是什麼？」
  - 「某專案目前卡在哪？」
  - 「某份文件在哪裡？」
- AC-42: 回答依據以下優先級檢索：已整理的會議記錄 > AI 自動摘要 > 上傳文件/合約 > 專案里程碑/任務 > 原始群組訊息
- AC-43: 回答分為「快速回答」與「依據模式」兩種：
  - 快速回答：直接回覆結論
  - 依據模式：回覆時附帶出處（哪次會議、哪份文件、哪段對話）
- AC-44: 僅能搜尋使用者有權限存取的群組與資料
- AC-45: 若搜尋不到相關資訊，明確回覆「找不到相關討論紀錄」

---

## 5. 主軸 C：AI Chat / AI Agent 操作層

### 5.1 使用者故事

| ID | 角色 | 故事 | 價值 |
|----|------|------|------|
| C-01 | 業務 | 作為業務，我希望在系統中用自然語言說「幫我建立新案件」然後系統自動帶入 | 以便不需逐一填寫表單欄位 |
| C-02 | PM | 作為 PM，我希望問系統「這個月還沒請款但已達驗收點的案件有哪些」 | 以便快速定位需要跟進的專案 |
| C-03 | 業務 | 作為業務，我希望說「幫我把這次會議內容整理成提案規格草稿」 | 以便快速將討論結果轉化為正式文件 |
| C-04 | 管理者 | 作為管理者，我希望所有 AI 操作都有權限控制與稽核紀錄 | 以便確保系統安全並可追溯每一次操作 |
| C-05 | 業務 | 作為業務，我希望在 LINE 群組中也能使用同樣的 AI Agent 能力 | 以便在最常使用的工具中直接完成工作 |
| C-06 | 業務 | 作為業務，我希望AI能根據公司歷史提案和知識庫幫我生成提案書初稿 | 以便加快售前文件準備速度並保持公司風格一致 |

### 5.2 AI Chat 介面規格

**功能描述**：在系統內建立 AI Chat 介面，使用者可透過自然語言與系統互動，執行查詢、生成、操作與分析四類任務。

**驗收標準**：
- AC-46: AI Chat 以可收合的側邊面板或獨立頁面呈現，不影響現有頁面操作
- AC-47: 支援對話歷史保留（同一 session 內）
- AC-48: 支援四類互動：
  - 查詢型：查資料、查狀態、查歷史決策
  - 生成型：生成提案書、規格書、會議摘要
  - 操作型：建案、建會議、更新狀態、建立任務
  - 分析型：彙整案件風險、預估分潤、找出卡關專案
- AC-49: 操作型指令必須顯示「即將執行的動作」確認畫面
- AC-50: 每次互動的請求與回應寫入稽核紀錄

**前端規格**：

```
頁面位置: /ai-chat（獨立頁面）或系統內全域可呼叫的側邊面板
元件結構:
├── ChatPanel (主面板)
│   ├── MessageList (對話歷史)
│   │   ├── UserMessage (使用者輸入)
│   │   ├── AssistantMessage (AI 回應)
│   │   └── ActionConfirmCard (操作確認卡片)
│   ├── InputArea (文字輸入 + 附件按鈕)
│   └── ContextIndicator (顯示目前上下文：專案/群組/通用)
```

**API 規格**：

```
POST /api/agent/chat
Request:
  {
    "message": "幫我找出這個月已達驗收點但還沒請款的案件",
    "session_id": "uuid",
    "context": {
      "current_page": "/cases",
      "project_id": null
    }
  }
Response (200, streaming):
  {
    "type": "text" | "action_plan" | "confirmation_required",
    "content": "...",
    "sources": [{ "type": "project", "id": "uuid", "title": "..." }],
    "action_plan": null | {
      "steps": [{ "action": "query_projects", "params": {...} }],
      "requires_confirmation": false
    }
  }
```

### 5.3 Agent 能力分級與權限矩陣

系統採三層權限分級，確保 AI Agent 的操作安全。

#### 分級定義

| 層級 | 定義 | 安全要求 |
|------|------|----------|
| Level 1: 直接執行 | 低風險查詢與生成類操作 | 無需額外確認，直接回應 |
| Level 2: 確認後執行 | 涉及資料建立或修改的操作 | 顯示執行計畫，使用者確認後才執行 |
| Level 3: 嚴格限制 | 涉及財務、刪除或對外發送的操作 | 需特定角色權限 + 二次確認 + 稽核紀錄 |

#### 權限矩陣

| 操作 | 層級 | admin | finance | leader | pm | sales |
|------|------|:-----:|:-------:|:------:|:--:|:-----:|
| 查詢案件清單 | L1 | v | v | v | v | 僅自己 |
| 查詢分潤狀態 | L1 | v | v | v | - | 僅自己 |
| 整理會議摘要 | L1 | v | v | v | v | v |
| 生成提案草稿 | L1 | v | v | v | v | v |
| 搜尋知識庫 | L1 | v | v | v | v | v |
| 建立新案件 | L2 | v | - | v | v | v |
| 建立付款期程 | L2 | v | v | v | v | - |
| 建立 Google Meet | L2 | v | v | v | v | v |
| 更新聯絡人 Email | L2 | v | - | v | v | - |
| 生成正式提案書 | L2 | v | v | v | v | v |
| 發放分潤/產勞報單 | L3 | v | v | - | - | - |
| 修改分潤比例 | L3 | v | - | - | - | - |
| 刪除專案/資料 | L3 | v | - | - | - | - |
| 預支分潤 | L3 | v | v | - | - | - |
| 修改財務數字 | L3 | v | v | - | - | - |

### 5.4 Agent 執行流程

```
┌──────────────────────────────────────────────────────────────────────┐
│                     AI Agent 執行流程                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  使用者輸入 (Web AI Chat / LINE 群組)                                │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────┐                                 │
│  │ 1. Intent Parser (意圖解析)      │                                 │
│  │    解析自然語言，判斷:            │                                 │
│  │    ├─ 操作類型 (query/generate/   │                                │
│  │    │           action/analyze)   │                                │
│  │    ├─ 目標實體 (project/meeting/  │                                │
│  │    │           commission/...)   │                                │
│  │    └─ 參數提取                    │                                │
│  └──────┬──────────────────────────┘                                 │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────┐                                 │
│  │ 2. Permission Engine (權限引擎)  │                                 │
│  │    ├─ 取得使用者角色              │                                 │
│  │    ├─ 查詢權限矩陣               │                                 │
│  │    ├─ 判斷操作層級 (L1/L2/L3)    │                                 │
│  │    └─ 若無權限 → 回覆拒絕原因     │                                │
│  └──────┬──────────────────────────┘                                 │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────┐                                 │
│  │ 3. Knowledge Retrieval (知識檢索)│                                 │
│  │    ├─ 系統資料查詢               │                                 │
│  │    ├─ 知識庫向量搜尋             │                                 │
│  │    ├─ 群組摘要/會議記錄          │                                 │
│  │    └─ 歷史對話紀錄               │                                │
│  └──────┬──────────────────────────┘                                 │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────┐                                 │
│  │ 4. Plan Formation (計畫形成)     │                                 │
│  │    ├─ 若資訊不足 → 向使用者追問   │                                │
│  │    ├─ 形成可執行步驟             │                                 │
│  │    └─ 預覽影響範圍               │                                │
│  └──────┬──────────────────────────┘                                 │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────┐                                 │
│  │ 5. Confirmation (確認)           │                                 │
│  │    L1: 跳過，直接執行            │                                 │
│  │    L2: 顯示「即將執行」確認卡片   │                                │
│  │    L3: 顯示二次確認 + 風險提示    │                                │
│  └──────┬──────────────────────────┘                                 │
│         │ (使用者確認)                                                │
│         ▼                                                            │
│  ┌─────────────────────────────────┐                                 │
│  │ 6. Execution (執行)              │                                 │
│  │    ├─ 呼叫對應系統 API           │                                 │
│  │    ├─ 寫入資料庫                 │                                 │
│  │    └─ 觸發後續流程               │                                │
│  └──────┬──────────────────────────┘                                 │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────┐                                 │
│  │ 7. Report (回報)                 │                                 │
│  │    ├─ 告知完成狀態               │                                 │
│  │    ├─ 顯示產物/連結              │                                 │
│  │    ├─ 建議後續步驟               │                                 │
│  │    └─ 寫入 agent_tasks 稽核紀錄   │                                │
│  └─────────────────────────────────┘                                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**核心設計：同一套 Agent Core，多入口介面**

```
┌───────────────────┐    ┌───────────────────┐    ┌────────────────────┐
│  Web AI Chat      │    │ LINE 川輝AI助理    │    │  管理後台          │
│  (系統內 Chat)    │    │ (LINE OA Webhook) │    │  (監控 + 校正)     │
└────────┬──────────┘    └────────┬──────────┘    └────────┬───────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │      Agent Core            │
                    │  ┌──────────────────────┐  │
                    │  │ Intent/Command Parser│  │
                    │  ├──────────────────────┤  │
                    │  │ Permission Engine    │  │
                    │  ├──────────────────────┤  │
                    │  │ Workflow Engine      │  │
                    │  ├──────────────────────┤  │
                    │  │ Knowledge Retrieval  │  │
                    │  ├──────────────────────┤  │
                    │  │ Audit Log           │  │
                    │  └──────────────────────┘  │
                    └────────────────────────────┘
```

**資料模型**：

```
agent_tasks
├── id: UUID (PK)
├── session_id: UUID                    -- 對話 session
├── channel: VARCHAR(20)                -- web_chat / line / admin
├── requested_by: UUID (FK → users.id)
├── requested_by_identity_id: UUID (FK → contact_identities.id)  -- LINE 來源
├── intent: VARCHAR(100)                -- query_projects / create_project / generate_proposal / ...
├── original_message: TEXT              -- 使用者原始輸入
├── parsed_params: JSONB                -- 解析後的結構化參數
├── execution_plan: JSONB               -- 執行計畫步驟
├── permission_level: INTEGER           -- 1 / 2 / 3
├── confirmation_status: VARCHAR(20)    -- not_required / pending / confirmed / rejected
├── execution_status: VARCHAR(20)       -- pending / executing / completed / failed
├── result: JSONB                       -- 執行結果
├── error_message: TEXT
├── created_at: TIMESTAMPTZ
└── completed_at: TIMESTAMPTZ

assistant_commands
├── id: UUID (PK)
├── agent_task_id: UUID (FK → agent_tasks.id)
├── actor_id: UUID                      -- 執行者
├── channel: VARCHAR(20)                -- web_chat / line / admin
├── command_type: VARCHAR(50)           -- create_meeting / bind_email / retrieve_file / qa / ...
├── line_group_id: VARCHAR(100)
├── payload: JSONB
├── result_status: VARCHAR(20)          -- success / failed / partial
├── result_data: JSONB
├── created_at: TIMESTAMPTZ
└── completed_at: TIMESTAMPTZ
```

### 5.5 售前知識生成

**功能描述**：業務人員可透過 AI Chat 或川輝AI助理，根據公司歷史提案書、規格書、合約與知識庫，快速生成提案書初稿、討論規格要點、比對歷史案例。

**驗收標準**：
- AC-51: 業務可用自然語言描述客戶需求，AI 自動搜尋相似歷史提案
- AC-52: 生成的提案書遵循公司標準結構與語氣
- AC-53: 支援「規格討論模式」：可來回追問，逐步補齊功能清單
- AC-54: 生成結果附帶參考來源（哪份歷史提案、哪段知識庫）
- AC-55: 生成的文件可儲存版本，支援後續修訂

**知識來源優先級**：

| 優先級 | 知識來源 | 用途 |
|--------|----------|------|
| 1 | 公司既有提案書 | 提案語氣、結構、方案設計 |
| 2 | 公司既有規格書 | 功能拆解、技術描述 |
| 3 | 歷史合約 | 商務條件、付款方式參考 |
| 4 | 會議記錄 | 客戶需求上下文 |
| 5 | 群組對話 | 需求補充與決策歷程 |

**資料模型**：

```
knowledge_documents
├── id: UUID (PK)
├── title: VARCHAR(255)
├── document_type: VARCHAR(50)          -- proposal / specification / quotation / contract / meeting_notes / template
├── source_type: VARCHAR(30)            -- upload / system_generated / manus_import
├── source_id: UUID                     -- FK to project_documents or other source
├── project_id: UUID (FK → projects.id)
├── client_name: VARCHAR(255)
├── visibility_scope: VARCHAR(20)       -- public / role_restricted / owner_only
├── version: INTEGER DEFAULT 1
├── is_active: BOOLEAN DEFAULT true
├── tags: TEXT[]
├── created_by: UUID (FK → users.id)
├── created_at: TIMESTAMPTZ
└── updated_at: TIMESTAMPTZ

knowledge_access_policies
├── id: UUID (PK)
├── document_id: UUID (FK → knowledge_documents.id)
├── access_type: VARCHAR(20)            -- role / user / all
├── role_scope: VARCHAR(20)             -- admin / finance / leader / pm / sales
├── user_id: UUID (FK → users.id)
├── created_at: TIMESTAMPTZ
└── CONSTRAINT unique_policy UNIQUE (document_id, access_type, role_scope, user_id)
```

---

## 6. 資料模型變更

### 6.1 新增資料表清單

| 資料表 | 主要用途 | 關鍵欄位 |
|--------|----------|----------|
| `contracts` | 合約主檔 | project_id, contract_amount, tax_rate, signed_date, file_id |
| `contract_extraction_results` | AI 抽取暫存與審核 | raw_json, normalized_json, confidence_scores, status, reviewed_by |
| `project_payment_schedules` | 付款期程 | project_id, sequence_no, percentage, gross_amount, net_amount, trigger_type |
| `project_milestones` | 驗收里程碑 | project_id, title, acceptance_criteria, due_date, status |
| `milestone_payment_links` | 驗收與付款關聯 | milestone_id, payment_schedule_id |
| `project_warranties` | 保固條件 | project_id, warranty_days, start_trigger, start_date, end_date |
| `project_maintenance_plans` | 維護費規則 | project_id, enabled, monthly_fee, start_rule, billing_cycle |
| `commission_rules` | 每案分潤規則 | project_id, user_id, commission_rate, basis_type, tax_rate |
| `commission_events` | 分潤來源事件 | payment_schedule_id, net_received, calculated_commission, advance_offset |
| `payout_advance_records` | 預支分潤沖銷 | project_id, user_id, advance_amount, offset_status |
| `finance_transactions` | 統一交易事件 | transaction_type, amount, needs_labor_receipt, reference_type |
| `contact_identities` | 聯絡人身份主檔 | line_user_id, identity_type, email, is_vip, manually_verified |
| `group_participants` | 群組成員映射 | line_group_id, identity_id, role_in_group, label |
| `stored_files` | 檔案 metadata | storage_key, original_file_name, mime_type, source_message_id |
| `meeting_jobs` | AI 助理會議任務 | line_group_id, meet_url, participants, reminder_status |
| `agent_tasks` | AI Agent 工作流紀錄 | channel, intent, execution_plan, confirmation_status, execution_status |
| `assistant_commands` | 助理指令紀錄 | command_type, payload, result_status |
| `knowledge_documents` | 公司知識文件總表 | document_type, source_type, visibility_scope, version |
| `knowledge_access_policies` | 知識文件存取範圍 | document_id, access_type, role_scope |

### 6.2 既有資料表調整

| 資料表 | 調整項目 | 說明 |
|--------|----------|------|
| `projects` | 新增 `contract_id` 欄位 | FK → contracts.id，關聯合約主檔 |
| `projects` | 新增 `tax_rate` 欄位 | DECIMAL(5,4) 預設 0.05，用於分潤計算 |
| `projects` | 新增 `commission_rate_override` 欄位 | DECIMAL(5,4) 覆寫分潤率 |
| `line_messages` | 新增 `stored_file_id` 欄位 | FK → stored_files.id，關聯檔案 metadata |
| `line_messages` | 新增 `original_file_name` 欄位 | VARCHAR(500)，原始檔名（向下相容） |
| `labor_receipts` | 新增 `commission_event_id` 欄位 | FK → commission_events.id，追溯分潤來源 |
| `labor_receipts` | 新增 `finance_transaction_id` 欄位 | FK → finance_transactions.id |
| `line_group_members` | 新增 `identity_id` 欄位 | FK → contact_identities.id，關聯身份主檔 |

### 6.3 ER Diagram (Text-based)

```
                                    ┌──────────────────┐
                                    │    contracts     │
                                    │──────────────────│
                          ┌────────►│ id               │
                          │         │ project_id ──────┼──┐
                          │         │ contract_amount   │  │
                          │         │ tax_rate          │  │
                          │         │ signed_date       │  │
                          │         │ file_id           │  │
                          │         └──────────────────┘  │
                          │                               │
┌─────────────────────┐   │    ┌──────────────────────┐   │
│contract_extraction_ │   │    │     projects         │◄──┘
│results              │   │    │──────────────────────│
│─────────────────────│   │    │ id                   │
│ id                  │   │    │ client_name          │
│ file_id             │   │    │ amount               │
│ normalized_json     │───┘    │ tax_rate             │
│ confidence_scores   │        │ contract_id ─────────┼──► contracts
│ status              │        │ assigned_to ─────────┼──► users
│ reviewed_by         │        └────────┬─────────────┘
└─────────────────────┘                 │
                                        │
                    ┌───────────────────┬┴──────────────────┬──────────────────┐
                    │                   │                    │                  │
                    ▼                   ▼                    ▼                  ▼
    ┌───────────────────┐ ┌──────────────────┐ ┌────────────────┐ ┌────────────────────┐
    │ payment_schedules │ │  milestones      │ │  warranties    │ │ maintenance_plans   │
    │───────────────────│ │──────────────────│ │────────────────│ │────────────────────│
    │ project_id        │ │ project_id       │ │ project_id     │ │ project_id         │
    │ sequence_no       │ │ title            │ │ warranty_days  │ │ enabled            │
    │ percentage        │ │ acceptance_criteria│ │ start_trigger │ │ monthly_fee        │
    │ gross_amount      │ │ status           │ │ status         │ │ start_rule         │
    │ net_amount        │ └────────┬─────────┘ └────────────────┘ └────────────────────┘
    │ status            │          │
    └────────┬──────────┘          │
             │                     │
             └──────┬──────────────┘
                    ▼
         ┌──────────────────────┐
         │milestone_payment_links│
         │──────────────────────│
         │ milestone_id         │
         │ payment_schedule_id  │
         └──────────────────────┘

    ┌───────────────┐     ┌──────────────────┐     ┌────────────────────┐
    │commission_rules│     │commission_events │     │payout_advance_     │
    │───────────────│     │──────────────────│     │records             │
    │ project_id    │     │ project_id       │     │────────────────────│
    │ user_id       │     │ payment_schedule │     │ project_id         │
    │ commission_rate│    │ net_received     │     │ user_id            │
    │ tax_rate      │     │ calculated_      │     │ advance_amount     │
    └───────────────┘     │  commission      │     │ offset_status      │
                          │ advance_offset   │     └────────────────────┘
                          │ payable_amount   │
                          └────────┬─────────┘
                                   │
                                   ▼
                    ┌──────────────────────┐     ┌──────────────────┐
                    │finance_transactions  │     │  labor_receipts  │
                    │──────────────────────│     │──────────────────│
                    │ transaction_type     │     │ commission_event │
                    │ amount               │     │ gross_amount     │
                    │ needs_labor_receipt  │────►│ tax_amount       │
                    │ reference_id         │     │ insurance_amount │
                    └──────────────────────┘     │ net_amount       │
                                                └──────────────────┘

    ┌───────────────────┐     ┌──────────────────┐     ┌──────────────┐
    │contact_identities │     │group_participants│     │ stored_files │
    │───────────────────│     │──────────────────│     │──────────────│
    │ line_user_id      │◄────│ identity_id      │     │ storage_key  │
    │ identity_type     │     │ line_group_id     │     │ original_    │
    │ email             │     │ role_in_group     │     │  file_name   │
    │ is_vip            │     │ label             │     │ mime_type    │
    │ internal_user_id  │     └──────────────────┘     │ source_msg_id│
    └───────────────────┘                              └──────────────┘

    ┌───────────────┐     ┌──────────────────┐     ┌──────────────────────┐
    │  agent_tasks  │     │assistant_commands│     │knowledge_documents   │
    │───────────────│     │──────────────────│     │──────────────────────│
    │ channel       │◄────│ agent_task_id    │     │ document_type        │
    │ intent        │     │ command_type     │     │ visibility_scope     │
    │ execution_plan│     │ payload          │     │ version              │
    │ result        │     │ result_status    │     └──────────┬───────────┘
    └───────────────┘     └──────────────────┘                │
                                                              ▼
                                                ┌──────────────────────────┐
                                                │knowledge_access_policies │
                                                │──────────────────────────│
                                                │ document_id              │
                                                │ access_type              │
                                                │ role_scope               │
                                                └──────────────────────────┘
```

---

## 7. API 設計

### 7.1 新增 API 端點

#### 合約與建案 API

| API | 方法 | 功能 | 權限 |
|-----|------|------|------|
| `/api/contracts/extract` | POST | 上傳合約/提案書，AI 抽取結構化資訊 | admin, leader, pm, sales |
| `/api/contracts/confirm` | POST | 確認抽取結果並一鍵建案 | admin, leader, pm, sales |
| `/api/contracts/:id` | GET | 查詢合約詳情 | admin, finance, leader, pm |
| `/api/contracts/extractions` | GET | 查詢待確認的抽取結果列表 | admin, leader, pm |
| `/api/contracts/extractions/:id` | PUT | 更新抽取結果審核狀態 | admin, leader, pm |

#### 付款與驗收 API

| API | 方法 | 功能 | 權限 |
|-----|------|------|------|
| `/api/projects/:id/payment-schedules` | GET/POST | 取得/建立付款期程 | admin, finance, leader, pm |
| `/api/projects/:id/payment-schedules/:scheduleId` | PUT | 更新付款期程 | admin, finance |
| `/api/projects/:id/milestones` | GET/POST | 取得/建立驗收里程碑 | admin, leader, pm |
| `/api/projects/:id/milestones/:milestoneId` | PUT | 更新驗收狀態 | admin, leader, pm |
| `/api/projects/:id/warranties` | GET/POST/PUT | 管理保固條件 | admin, finance, leader, pm |
| `/api/projects/:id/maintenance-plans` | GET/POST/PUT | 管理維護費計畫 | admin, finance |

#### 分潤引擎 API

| API | 方法 | 功能 | 權限 |
|-----|------|------|------|
| `/api/commissions/calculate` | POST | 依收款計算未稅分潤 | admin, finance |
| `/api/commissions/events` | GET | 查詢分潤事件列表 | admin, finance, leader |
| `/api/commissions/events/:id` | GET | 查詢單筆分潤事件詳情 | admin, finance |
| `/api/commissions/advance` | POST | 建立預支分潤記錄 | admin, finance |
| `/api/commissions/advance/:id/offset` | POST | 執行預支沖銷 | admin, finance |
| `/api/finance/transactions` | GET/POST | 查詢/建立交易事件 | admin, finance |

#### 身份管理 API

| API | 方法 | 功能 | 權限 |
|-----|------|------|------|
| `/api/identities` | GET | 搜尋聯絡人身份 | admin, leader, pm |
| `/api/identities` | POST | 新增/更新身份 | admin, leader, pm |
| `/api/identities/:id` | PUT | 編輯身份詳情 | admin, leader, pm |
| `/api/identities/bind` | POST | 手動綁定 LINE 成員 | admin, leader |
| `/api/groups/:groupId/participants` | GET | 取得群組成員與身份 | admin, leader, pm |

#### AI Agent API

| API | 方法 | 功能 | 權限 |
|-----|------|------|------|
| `/api/agent/chat` | POST | AI Chat 對話（支援 streaming） | 依意圖動態判斷 |
| `/api/agent/confirm` | POST | 確認 Agent 執行計畫 | 依操作層級判斷 |
| `/api/agent/tasks` | GET | 查詢 Agent 任務紀錄 | admin, leader |
| `/api/agent/tasks/:id` | GET | 查詢單筆任務詳情 | admin, leader |

#### 會議 API（擴充）

| API | 方法 | 功能 | 權限 |
|-----|------|------|------|
| `/api/meetings/create-google-meet` | POST | 建立 Google Meet 會議 | all |
| `/api/meetings/jobs` | GET | 查詢會議任務列表 | admin, leader, pm |

#### 知識庫 API（擴充）

| API | 方法 | 功能 | 權限 |
|-----|------|------|------|
| `/api/knowledge/documents` | GET | 查詢知識文件列表 | 依 visibility_scope |
| `/api/knowledge/documents` | POST | 新增知識文件 | admin, leader |
| `/api/knowledge/search` | POST | 搜尋知識庫（向量 + 關鍵字） | all |
| `/api/knowledge/generate-proposal` | POST | 根據知識庫生成提案書 | all |

#### 檔案 API（擴充）

| API | 方法 | 功能 | 權限 |
|-----|------|------|------|
| `/api/files/download/:id` | GET | 以原始檔名下載檔案 | 依群組權限 |
| `/api/files/retrieve` | POST | 從 Storage 取回並重傳至 LINE 群組 | 依群組權限 |

### 7.2 既有 API 調整

| API | 調整項目 |
|-----|----------|
| `/api/messaging/webhook` | 擴充：收到檔案時同步寫入 `stored_files` 表（含原始檔名）；支援新指令解析（建立會議、綁定 Email、取回檔案、知識問答）；路由至 Agent Core |
| `/api/documents/analyze-proposal` | 擴充：回傳結構化抽取結果改寫入 `contract_extraction_results`，不再直接建案 |
| `/api/cron/meeting-reminders` | 擴充：增加 `meeting_jobs` 表的提醒處理 |
| `/api/storage/backfill` | 擴充：回溯時同步建立 `stored_files` 記錄 |

---

## 8. 前端頁面規劃

### 8.1 新增頁面

| 頁面名稱 | 路徑 | 功能 | 進入方式 |
|----------|------|------|----------|
| AI 建案確認頁 | `/contracts/confirm/[extractionId]` | 檢視 AI 抽取結果、修正欄位、一鍵建案 | 從 AI 建案入口上傳文件後導向 |
| 分潤帳務中心 | `/finance/transactions` | 統一檢視收款、分潤、預支、額外款項、發包支出 | 從財務總覽導航 |
| 身份管理頁 | `/settings/identities` | 管理 LINE 聯絡人身份、綁定、標籤 | 從設定頁面的 Tab |
| AI Chat 頁 | `/ai-chat` | AI 對話介面，自然語言操作系統 | 主導航新增入口或全域按鈕 |
| Agent 執行紀錄 | `/settings/agent-logs` | 查看 AI Agent 所有操作紀錄 | 從設定頁面的 Tab |
| 提案工作台 | `/ai-generator?tab=proposal-studio` | 知識庫驅動的提案書生成與規格討論 | 從 AI 工具頁面的 Tab |

### 8.2 既有頁面調整

| 頁面 | 路徑 | 調整項目 |
|------|------|----------|
| 案件管理 | `/cases` | 新增「AI 建案」入口按鈕，導向合約上傳流程 |
| 專案詳情 | `/projects/[id]` | 新增「付款期程」、「驗收里程碑」、「保固」、「維護」Tab；顯示合約關聯資訊 |
| 財務總覽 | `/finance` | 新增「帳務中心」快捷入口；分潤區塊改為顯示未稅計算結果 |
| LINE 群組管理 | `/line-integration` | 檔案 Tab 顯示原始檔名；成員 Tab 顯示身份綁定狀態與快捷綁定按鈕 |
| 設定 | `/settings` | 新增「身份管理」Tab 與「Agent 紀錄」Tab |
| AI 工具 | `/ai-generator` | 新增「提案工作台」Tab；重構智能建案 Tab 對接新建案流程 |
| 我的分潤 | `/my-payouts` | 顯示每筆分潤的未稅計算依據與預支沖銷明細 |
| 導航列 | `components/Layout.js` | 新增 AI Chat 入口（全域可見的浮動按鈕或導航項目） |

---

## 9. 安全與權限

### 9.1 AI Agent 權限矩陣

（詳見 5.3 節完整矩陣）

**核心原則**：
1. AI Agent 只能存取使用者本身有權限看到的資料（遵循既有 RLS 規則）
2. 操作型動作分三級管理：直接執行、確認後執行、嚴格限制
3. 財務相關操作（分潤發放、金額修改、預支）一律歸為嚴格限制等級
4. 刪除操作僅限 admin 角色

### 9.2 資料存取控制

| 控制層面 | 機制 | 說明 |
|----------|------|------|
| 資料列級 | Supabase RLS | 所有新增資料表均須設定 RLS 政策 |
| 角色級 | `utils/permissions.js` 擴充 | 新增模組的權限定義加入既有權限矩陣 |
| API 級 | API Routes 中驗證角色 | 每個 API 端點在入口處驗證使用者角色 |
| Agent 級 | Permission Engine | Agent 操作前查詢權限矩陣，不符合則拒絕 |
| 知識庫級 | `knowledge_access_policies` | 文件可見範圍依角色與擁有者控制 |

**新增 RLS 政策要求**：

| 資料表 | 政策 |
|--------|------|
| `contracts` | admin/finance/leader/pm 可讀；admin/leader/pm 可寫 |
| `commission_events` | admin/finance 可讀寫；sales 可讀自己的 |
| `finance_transactions` | admin/finance 可讀寫 |
| `payout_advance_records` | admin/finance 可讀寫；sales 可讀自己的 |
| `contact_identities` | admin/leader/pm 可讀寫 |
| `agent_tasks` | admin/leader 可讀所有；其他角色可讀自己的 |
| `knowledge_documents` | 依 `knowledge_access_policies` 控制 |

### 9.3 稽核紀錄

**必須記錄的操作**：

| 操作類別 | 記錄項目 |
|----------|----------|
| 財務操作 | 分潤發放、預支建立、金額修改、勞報單產生 |
| 專案操作 | 建案、刪案、修改合約金額、修改分潤比例 |
| AI Agent 操作 | 所有 Agent 的查詢、生成、建立、修改（寫入 `agent_tasks`） |
| 權限變更 | 角色變更、身份綁定、VIP 標記 |
| 外部操作 | Google Meet 建立、LINE 訊息發送、檔案重傳 |

**稽核紀錄格式**（寫入 `agent_tasks` 或新建 `audit_logs` 表）：

```
audit_logs
├── id: UUID (PK)
├── actor_id: UUID (FK → users.id)
├── actor_type: VARCHAR(20)            -- user / agent / system / cron
├── action: VARCHAR(100)
├── resource_type: VARCHAR(50)
├── resource_id: UUID
├── old_value: JSONB
├── new_value: JSONB
├── ip_address: VARCHAR(45)
├── user_agent: TEXT
├── created_at: TIMESTAMPTZ
```

---

## 10. 實作優先順序

### P1 (MVP Must-have)

| 順序 | 功能 | 原因 | 預估工時 |
|------|------|------|----------|
| 1 | 合約上傳 + AI 抽取 + 人工確認建案 | 直接解決最耗時的人工整理，是所有後續流程的基礎 | 2-3 週 |
| 2 | 付款期程 / 驗收里程碑自動建立 | 是財務自動化與專案追蹤的前提 | 1-2 週 |
| 3 | 未稅實收分潤計算引擎 + 勞報單自動產生 | 直接解決高頻且高風險的財務作業 | 2-3 週 |
| 4 | 聯絡人身份主檔 + 後台手動綁定 | 是 AI 助理準確運作的基礎 | 1-2 週 |
| 5 | 統一交易事件模型 (finance_transactions) | 支援預支、額外款項、發包支出等帳務場景 | 1 週 |
| 6 | AI Chat 基礎版（查詢 + 生成） | 體感提升最快、內部最有感的功能 | 2-3 週 |

### P2 (MVP Nice-to-have)

| 順序 | 功能 | 原因 | 預估工時 |
|------|------|------|----------|
| 7 | 售前知識生成（提案書 + 規格討論） | 能立即提升業務效率與知識複用 | 2 週 |
| 8 | LINE 群組建立 Google Meet + 提醒 | 使用頻率高、團隊體感明顯 | 2 週 |
| 9 | 檔案原始檔名還原 | 技術難度低但改善感顯著 | 0.5 週 |
| 10 | 保固與維護費結構化 | 專案管理完整性的基礎 | 1 週 |

### P3 (Phase 2)

| 順序 | 功能 | 原因 | 預估工時 |
|------|------|------|----------|
| 11 | 群組取回過期檔案 | 高價值，但依賴訊息映射完整度 | 1 週 |
| 12 | 群組知識問答 | 需資料治理與權限完善後才穩定 | 2-3 週 |
| 13 | AI Agent 進階自動執行（L2/L3 操作） | 需在權限與稽核成熟後擴大 | 3-4 週 |
| 14 | 維護費自動化（到期提醒 + 帳單追蹤） | 依賴保固結構化完成 | 1-2 週 |
| 15 | 多人分潤、補差額、跨期調整 | 財務彈性化的進階需求 | 2 週 |
| 16 | 群組內補綁 Email / 角色 | 身份管理的便利性延伸 | 1 週 |
| 17 | 提案與規格協作工作台 | 版本管理與多人協作的進階場景 | 3 週 |
| 18 | 合約理解進階（附約、多版本比對） | 複雜合約場景的覆蓋 | 2-3 週 |

---

## 11. 風險與緩解策略

| 風險 | 影響程度 | 發生機率 | 緩解策略 |
|------|----------|----------|----------|
| AI 誤判合約內容 | 高 — 付款、驗收、保固條件若抽錯會影響全部後續流程 | 中高 | 必須有人工確認層；低信心欄位醒目標示；不直接寫入正式資料表 |
| 分潤計算邏輯錯誤 | 高 — 直接影響員工薪酬、稅務正確性與內部信任 | 中 | 計算邏輯集中於 `commission_events` 模型，每筆均可追溯；上線前以歷史資料回測驗證 |
| AI Agent 權限過大 | 高 — 可能誤改財務或客戶資料 | 中 | 三層權限分級；財務操作嚴格限制；所有操作留稽核紀錄 |
| Google Calendar API 整合複雜度 | 中 — OAuth 流程、API 配額、權限設定 | 中高 | 使用 Service Account 降低授權複雜度；建立失敗時 fallback 為純提醒模式 |
| 歷史知識庫品質不一 | 中 — 提案生成可能引用過時或低品質內容 | 中高 | 建立文件版本與啟用狀態管理；生成時附帶參考來源供人工判斷 |
| LINE 身份辨識錯誤 | 中 — 會影響通知、問答、會議邀請 | 中 | 建立人工補正機制；手動綁定優先級高於 AI 推論 |
| 前端效能壓力 | 中 — 新增模組後頁面與元件增多 | 中 | 新頁面採 CSS Modules；善用動態載入 (dynamic import)；分潤計算邏輯移至後端 |
| 資料遷移風險 | 中 — 既有 projects / commissions / labor_receipts 需與新模型兼容 | 中 | 新增資料表為主，既有表僅新增欄位不修改原有欄位；提供遷移腳本與回溯方案 |
| 取回檔案與外發動作 | 中 — 涉及資料外發與權限 | 低 | 操作前驗證群組權限；所有外發行為寫入稽核紀錄 |
| Supabase RLS 管理複雜度 | 中 — 19 張新表均需設定 RLS | 中 | 建立 RLS 政策範本與測試腳本；列入 code review checklist |

---

## 12. 技術依賴

### 新增 NPM 套件

| 套件 | 用途 | 預估版本 |
|------|------|----------|
| `googleapis` | Google Calendar API 整合（建立 Meet 會議） | ^130.0.0 |
| `google-auth-library` | Google Service Account 認證 | ^9.0.0 |
| `eventsource-parser` | AI Chat streaming 回應解析 | ^2.0.0 |
| `uuid` | 各資料表 UUID 生成 | ^9.0.0 |
| `zod` | API 請求參數驗證 | ^3.22.0 |

### 外部 API 整合

| 服務 | 用途 | 認證方式 | 新增環境變數 |
|------|------|----------|-------------|
| Google Calendar API | 建立 Google Meet 會議、管理行事曆事件 | Service Account (JSON Key) | `GOOGLE_SERVICE_ACCOUNT_KEY` |
| Google Meet | 產生 Meet 視訊會議連結 | 附帶在 Calendar Event 中 | （同上） |
| Anthropic Claude API | AI Chat Agent Core、知識問答、提案生成 | API Key | （既有 `ANTHROPIC_API_KEY`） |
| OpenAI Embeddings API | 知識庫向量化 | API Key | （既有 `OPENAI_API_KEY`） |
| LINE Messaging API | 群組訊息發送、檔案重傳 | Channel Access Token | （既有） |

### 新增環境變數

| 變數 | 必要性 | 用途 |
|------|--------|------|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | P2 必要 | Google Calendar/Meet 整合 (JSON 格式) |
| `GOOGLE_CALENDAR_ID` | P2 必要 | 公司行事曆 ID |

### 新增 Vercel Cron Jobs

| 排程 | API | 功能 |
|------|-----|------|
| 每日 01:00 UTC | `/api/cron/warranty-check` | 檢查保固到期並發送提醒 |
| 每小時 | `/api/cron/meeting-job-reminders` | 處理 meeting_jobs 提醒（前一天 & 前一小時） |

---

## 13. 驗收標準

### 主軸 A：合約與帳務自動化

| 驗收項目 | 驗收條件 | 優先級 |
|----------|----------|--------|
| 合約上傳與 AI 抽取 | 上傳 PDF/Word 合約後 30 秒內產出結構化抽取結果，信心評分正確標示 | P1 |
| 人工確認建案 | 確認後一鍵建立 project + payment_schedules + milestones + warranties + maintenance_plans + commission_rules | P1 |
| 付款期程 | 支援任意期數與比例，可與驗收里程碑綁定 | P1 |
| 未稅分潤計算 | 輸入含稅收款金額後自動計算未稅金額與分潤，計算結果與手動驗算一致 | P1 |
| 勞報單自動產生 | 分潤事件發生後自動建立勞報單，扣繳稅與健保費計算正確 | P1 |
| 預支與沖銷 | 可建立預支記錄，後續分潤自動扣除預支金額，沖銷狀態正確更新 | P1 |
| 統一交易事件 | finance_transactions 可記錄收款、分潤、預支、額外款項、發包支出 | P1 |
| 保固追蹤 | 保固到期前 7 天與當天發送提醒通知 | P2 |

### 主軸 B：川輝AI助理強化

| 驗收項目 | 驗收條件 | 優先級 |
|----------|----------|--------|
| 身份管理後台 | 可搜尋、新增、編輯聯絡人身份，手動綁定覆蓋 AI 推論 | P1 |
| 檔名還原 | 下載 LINE 群組檔案時使用原始檔名 | P2 |
| Google Meet 建立 | LINE 群組指令觸發後成功建立 Meet 並回傳連結至群組 | P2 |
| 會議提醒 | 前一天與前一小時於群組發送提醒 | P2 |
| 檔案取回 | 回覆歷史訊息後成功從 Storage 取回並傳送至群組 | P3 |
| 群組知識問答 | 可回答本群歷史討論，回答附帶來源出處 | P3 |

### 主軸 C：AI Chat / AI Agent

| 驗收項目 | 驗收條件 | 優先級 |
|----------|----------|--------|
| AI Chat 介面 | 可輸入自然語言並取得回應，支援對話歷史 | P1 |
| 查詢型操作 | 可查詢案件清單、分潤狀態、專案進度 | P1 |
| 生成型操作 | 可生成提案書初稿、會議摘要 | P1 |
| 操作型 L2 確認流程 | 建案/建會議等操作顯示確認卡片，確認後才執行 | P2 |
| 權限矩陣 | 不同角色可見/可執行的操作符合矩陣定義 | P1 |
| 稽核紀錄 | 所有 Agent 操作均寫入 agent_tasks，可查詢追溯 | P1 |
| 售前提案生成 | 可根據客戶需求搜尋相似歷史提案並生成初稿 | P2 |
| LINE + Web 共用 Agent Core | LINE 川輝AI助理與 Web AI Chat 共用同一套 Agent 核心 | P2 |

### 整體品質要求

| 項目 | 要求 |
|------|------|
| 安全性 | 所有新增資料表均設定 Supabase RLS；API 端點入口驗證角色權限 |
| 效能 | AI 抽取回應 < 30 秒；AI Chat 回應 < 10 秒（首字元）；頁面載入 < 3 秒 |
| 相容性 | 不破壞既有功能；既有資料無需遷移即可與新模型並存 |
| 可維護性 | 分潤計算邏輯集中於後端服務層，不散落於頁面；Agent Core 統一封裝可複用 |
| 可追溯性 | 每筆分潤可追溯至客戶付款、未稅計算、預支沖銷的完整鏈路 |

---

*本文件為 PRD v1.0 初版草案，後續將依工程團隊反饋進行迭代更新。*
