# 川輝科技 — 業務分潤管理系統架構文件

> 最後更新：2026-04-03

---

## 1. 系統概覽

業務分潤管理系統是一套 B2B 銷售與專案管理平台，涵蓋從商機洽談、合約簽訂、付款追蹤、分潤計算到勞報單產出的完整業務流程，並整合 LINE 通訊記錄與 AI 文件生成能力。

### 技術棧

| 層級 | 技術 | 版本 |
|------|------|------|
| 前端框架 | Next.js (Pages Router) | 14.2.3 |
| UI 函式庫 | React | 18.2.0 |
| 資料庫/後端 | Supabase (PostgreSQL + Auth + Storage) | supabase-js 2.39.3 |
| 向量搜尋 | pgvector (Supabase 擴充) | — |
| AI 文件生成 | Claude (Anthropic SDK) | 0.71.2 |
| AI 向量化 | OpenAI Embeddings (text-embedding-3-small) | — |
| 圖表 | Recharts | 3.1.2 |
| 拖曳 | react-beautiful-dnd | 13.1.1 |
| PDF 產生 | jspdf + pdfmake | 3.0.1 / 0.2.20 |
| Excel 匯出 | xlsx | 0.18.5 |
| 文件解析 | pdf-parse (PDF) + mammoth (Word) | 2.4.5 / 1.11.0 |
| 部署 | Vercel (含 Cron Jobs) | — |

---

## 2. 系統架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                         使用者瀏覽器                          │
│                     React 18 + Next.js 14                    │
└──────────┬──────────────────────────────────┬───────────────┘
           │ supabase-js 直接查詢               │ fetch API Routes
           ▼                                    ▼
┌─────────────────────┐          ┌──────────────────────────┐
│      Supabase       │          │   Next.js API Routes     │
│                     │          │   (Vercel Serverless)    │
│  ┌───────────────┐  │          │                          │
│  │  PostgreSQL   │  │  ◄────── │  /api/messaging/*        │
│  │  + pgvector   │  │          │  /api/documents/*        │
│  ├───────────────┤  │          │  /api/meetings/*         │
│  │  Auth (JWT)   │  │          │  /api/activities/*       │
│  ├───────────────┤  │          │  /api/cron/*             │
│  │  Storage      │  │          │  /api/storage/*          │
│  │  (chat-files) │  │          │  /api/line/*             │
│  └───────────────┘  │          └─────┬───────────┬────────┘
└─────────────────────┘                │           │
                                       ▼           ▼
                              ┌──────────┐  ┌───────────┐
                              │ LINE API │  │ OpenAI /  │
                              │ (Webhook)│  │ Claude AI │
                              └──────────┘  └───────────┘
```

**資料流特點**：大部分 CRUD 操作由前端透過 `supabase-js` 直接查詢資料庫；只有需要伺服器端邏輯的場景（LINE Webhook 驗簽、AI API 呼叫、檔案解析）才走 API Routes。

---

## 3. 五大核心模組

### 3.1 專案管理模組

管理從商機洽談到專案結案的完整生命週期。

| 頁面 | 路徑 | 功能說明 |
|------|------|----------|
| 案件管理 | `/cases` | 統一檢視所有洽談中商機與已簽約專案，支援搜尋、篩選、新增案件 |
| 洽談管道 | `/prospects` | Kanban 看板（拖曳換階段）、優先級檢視、任務檢視三種模式 |
| 專案詳情 | `/projects/[id]` | 專案資訊、付款期數、文件管理、勞報單關聯 |
| 儀表板 | `/dashboard` | KPI 總覽、月營收圖表、團隊績效、管道狀態、分潤預測 |

#### 洽談管道階段

```
初談 → 提案 → 報價 → 談判 → 待簽約 → 已成交 (轉為專案)
                                    └→ 已失單
```

#### 洽談屬性

| 欄位 | 說明 |
|------|------|
| 成交機率 | 高 (80%) / 中 (50%) / 低 (20%) |
| 預算狀態 | 充足 / 不足 / 過低 |
| 優先級 | 緊急 / 高 / 中 / 低 |
| 負責人 | 指定業務人員 |
| 預計簽約日 | 預期成交日期 |

#### 活動追蹤 (Activities)

支援 12 種行動類型：電話、會議、簡報、報價、文件發送、樣品發送、拜訪、Demo、合約、跟進、其他。透過 `/api/activities` API 管理，關聯至特定洽談案件。

---

### 3.2 財務分潤模組

管理客戶付款、業務分潤計算、勞報單產出的完整財務流程。

| 頁面 | 路徑 | 功能說明 |
|------|------|----------|
| 財務總覽 | `/finance` | 已收金額、分潤總額、待發金額、勞報單統計（admin/finance） |
| 我的分潤 | `/my-payouts` | 業務自助查看待領/已完成分潤、下載勞報單 PDF |
| 分潤管理 | `/commissions` | 分潤記錄管理 |
| 付款記錄 | `/payments` | 客戶付款登錄，觸發分潤計算 |
| 發放管理 | `/payout-management` | 分潤發放審核 |
| 勞報單 | `/labor-receipts` | 勞報單列表、篩選、批次產生、PDF/CSV 匯出 |

#### 分潤計算邏輯 (`pages/index.js:106-166`)

**新案 — 階梯式抽成**：

| 合約金額區間 | 分潤比例 |
|-------------|---------|
| ≤ 100,000 | 35% |
| 100,001 ~ 300,000 | 30% |
| 300,001 ~ 600,000 | 25% |
| 600,001 ~ 1,000,000 | 20% |
| > 1,000,000 | 10% |

**續約** — 固定 15%

**覆寫** — 專案可設定固定分潤百分比，覆蓋階梯制

#### 分潤發放公式

```
可發放分潤 = 分潤總額 × (已收款 / 合約總額) - 已發放金額
```

分潤按客戶實際付款比例逐步發放，非一次性全額。

#### 勞報單自動計算

| 項目 | 計算方式 |
|------|---------|
| 扣繳稅額 | 總額 × 10% |
| 二代健保 | 總額 × 2.11%（僅 ≥ 20,000 元） |
| 實發金額 | 總額 - 扣繳稅 - 健保費 |

勞報單狀態流程：`草稿 (draft)` → `已開立 (issued)` → `已付款 (paid)`

工作流程狀態：`待處理 (pending)` → `已下載 (downloaded)` → `已完成 (completed)`

---

### 3.3 LINE 整合模組

與 LINE Official Account 整合，自動擷取群組對話與檔案，提供 AI 摘要分析。

| 頁面 | 路徑 | 功能說明 |
|------|------|----------|
| LINE 群組管理 | `/line-integration` | 群組列表、訊息瀏覽、成員、檔案、AI 摘要 |
| 會議管理 | `/meetings` | AI 偵測的會議記錄、Seameet 逐字稿分析 |
| Storage 診斷 | `/storage-check` | 檢查 Storage 設定、回溯下載遺漏檔案 |

#### LINE 群組類型

| 類型 | 說明 | 顏色標記 |
|------|------|---------|
| prospect | 客戶洽談 | #f59e0b (橙) |
| internal | 內部專屬 | #8b5cf6 (紫) |
| team | 團隊大群 | #3b82f6 (藍) |
| project | 專案執行 | #10b981 (綠) |
| other | 其他 | #6b7280 (灰) |

#### 訊息儲存機制

```
LINE 事件 → /api/messaging/webhook (HMAC-SHA256 驗簽)
                    │
                    ├─ 文字訊息 → line_messages 表
                    ├─ 圖片/影片/音訊 → Supabase Storage (chat-files bucket)
                    ├─ 檔案 (PDF/Word等) → Supabase Storage (chat-files bucket)
                    ├─ 貼圖 → line_messages 表 (sticker_id)
                    └─ 位置 → line_messages 表 (經緯度、地址)
```

所有內容**永久保存**，不受 LINE 7 天內容過期限制。

#### LINE 帳號綁定

員工在 `/profile` 頁面透過 LINE Login OAuth 綁定帳號，綁定後系統可識別群組內訊息發送者身份。

#### Vercel Cron Jobs

| 排程 | API | 功能 |
|------|-----|------|
| 每日 08:00 UTC | `/api/cron/meeting-reminders` | 會議提醒通知 |
| 每日 22:00 UTC | `/api/cron/auto-summary` | 自動產生群組 AI 摘要 |

---

### 3.4 AI 工具模組

利用 RAG 架構進行文件生成與智能專案建立。

| 頁面 | 路徑 | 功能說明 |
|------|------|----------|
| AI 文件生成 | `/ai-generator` | 根據歷史文件生成提案書/規格書/報價單 |
| 智能建案 | `/ai-generator?tab=smart-project` | 上傳合約，AI 自動提取專案資訊 |
| 知識庫管理 | `/knowledge-base` | 管理已向量化的知識庫文件 |

#### RAG 文件生成流程

```
┌──────────┐    ┌───────────┐    ┌──────────────┐    ┌────────────────────┐
│ 上傳文件  │ →  │ pdf-parse │ →  │ OpenAI       │ →  │ document_embeddings│
│ (PDF/Word)│    │ mammoth   │    │ Embeddings   │    │ (pgvector)         │
│           │    │ 解析文字   │    │ 向量化       │    │ 儲存向量           │
└──────────┘    └───────────┘    └──────────────┘    └────────────────────┘

┌──────────────┐    ┌───────────────────┐    ┌──────────────┐    ┌──────────┐
│ 使用者輸入需求│ →  │ search_similar_   │ →  │ 取得 Top 3~5 │ →  │ Claude   │
│ (客戶/專案/  │    │ documents()       │    │ 相似歷史文件  │    │ 生成新文件│
│  需求描述)   │    │ 向量相似度搜尋     │    │ 作為參考上下文│    │          │
└──────────────┘    └───────────────────┘    └──────────────┘    └──────────┘
```

#### 支援的文件類型

| 代碼 | 類型 |
|------|------|
| `proposal` | 提案書 |
| `specification` | 規格書 |
| `quotation` | 報價單 |
| `contract` | 合約 |
| `meeting_notes` | 會議記錄 |

#### 智能建案

上傳已簽約的提案書/合約 → Claude 分析提取：客戶名稱、專案名稱、合約金額、付款條件、分期明細、專案類型、期程、聯絡人 → 一鍵建立專案。

#### 會議分析 (`/api/meetings/analyze`)

上傳 Seameet 逐字稿 → Claude 分析：
- 自動匹配現有洽談案件/專案
- 提取摘要、重點、待辦事項
- 評估客戶情緒與成交機率
- 建議洽談階段

---

### 3.5 用戶與權限模組

| 頁面 | 路徑 | 功能說明 |
|------|------|----------|
| 設定 | `/settings` | 用戶管理、知識庫管理（僅 admin/leader） |
| 個人設定 | `/profile` | 個人資料、銀行帳戶、LINE 綁定、勞報單設定 |
| 用戶管理 | `/user-management` | 團隊成員管理 |

#### 角色權限矩陣

| 權限 | admin | finance | leader | pm | sales |
|------|:-----:|:-------:|:------:|:--:|:-----:|
| 查看所有專案 | v | v | v | v | — |
| 查看成本/利潤 | v | v | — | — | — |
| 編輯成本 | v | v | — | — | — |
| 管理用戶 | v | v | v | — | — |
| 刪除專案 | v | — | — | — | — |
| 查看自己的專案 | v | v | v | v | v |

- 支援**多角色**：用戶可同時擁有多個角色（`users.roles` TEXT[] 欄位）
- 主要角色按優先級決定：`admin > finance > leader > pm > sales`
- 導航列依角色動態調整（財務入口、設定入口的顯示/隱藏）

#### 認證流程

```
使用者登入 (Supabase Auth)
       │
       ▼
  有 session？ ──否──→ 導向 /login
       │是
       ▼
  users 表有記錄？ ──否──→ 自動建立 (role: sales)
       │是
       ▼
  ID 以 pre_ 開頭？ ──是──→ 合併為真實 Auth ID
       │否
       ▼
  載入用戶資料 (id, email, name, role)
```

---

## 4. 資料庫結構

### 核心資料表

```
┌──────────┐     ┌───────────────────┐     ┌──────────────────┐
│  users   │     │    prospects      │     │    projects       │
│──────────│     │───────────────────│     │──────────────────│
│ id       │◄──┐ │ id                │     │ id               │
│ name     │   │ │ client_name       │     │ client_name      │
│ email    │   │ │ project_name      │     │ project_name     │
│ role     │   │ │ estimated_amount  │     │ amount           │
│ roles[]  │   ├─│ owner_id          │     │ assigned_to      │──►│users│
│ phone    │   │ │ stage             │     │ payment_template │
│ bank_info│   │ │ close_rate        │     │ sign_date        │
└──────────┘   │ │ budget_status     │     └────────┬─────────┘
               │ └───────────────────┘              │
               │                                     │
               │  ┌──────────────────────┐           │
               │  │ project_installments │           │
               │  │──────────────────────│           │
               │  │ id                   │           │
               │  │ project_id          ─┼───────────┘
               │  │ amount               │
               │  │ status (paid/pending)│
               │  │ payment_date         │
               │  └──────────┬───────────┘
               │             │
               │  ┌──────────┴───────────┐     ┌──────────────────┐
               │  │    commissions       │     │ commission_payouts│
               │  │──────────────────────│     │──────────────────│
               │  │ id                   │     │ id               │
               │  │ project_id           │     │ commission_id    │──►│commissions│
               │  │ user_id             ─┼──┐  │ installment_id   │──►│installments│
               │  │ amount               │  │  │ payout_amount    │
               │  │ percentage           │  │  │ status           │
               │  └──────────────────────┘  │  │ payout_date      │
               │                            │  └────────┬─────────┘
               │                            │           │
               │                            │  ┌────────┴─────────┐
               └────────────────────────────┤  │  labor_receipts  │
                                            │  │──────────────────│
                                            │  │ id               │
                                            │  │ commission_id    │
                                            └──│ user_id          │
                                               │ gross_amount     │
                                               │ tax_amount       │
                                               │ insurance_amount │
                                               │ net_amount       │
                                               │ status           │
                                               │ workflow_status  │
                                               └──────────────────┘
```

### LINE 相關資料表

```
┌──────────────┐     ┌──────────────┐     ┌────────────────────┐
│ line_groups  │     │line_messages │     │line_group_members  │
│──────────────│     │──────────────│     │────────────────────│
│ id           │     │ group_id     │──►  │ group_id           │──►│line_groups│
│ group_id     │◄────│ message_id   │     │ user_id            │
│ prospect_id  │──►  │ user_id      │     │ display_name       │
│ project_id   │──►  │ content      │     │ role (員工/客戶/PO)│
│ group_name   │     │ file_url     │     └────────────────────┘
│ group_type   │     │ timestamp    │
│ last_message │     └──────────────┘
└──────────────┘

┌──────────────────┐
│ meeting_records  │
│──────────────────│
│ id               │
│ prospect_id      │──► │prospects│
│ project_id       │──► │projects│
│ title            │
│ meeting_date     │
│ participants     │
│ content          │
│ analysis_result  │ (JSON: summary, key_points, action_items, sentiment, close_probability)
└──────────────────┘
```

### AI 知識庫資料表

```
┌───────────────────┐     ┌───────────────────────┐
│ project_documents │     │ document_embeddings   │
│───────────────────│     │───────────────────────│
│ id                │◄────│ document_id           │
│ project_id        │     │ project_id            │
│ file_name         │     │ content_text          │
│ public_url        │     │ chunk_index           │
│ document_status   │     │ chunk_total           │
│ deleted_at        │     │ embedding vector(1536)│
└───────────────────┘     │ document_type         │
                          │ document_name         │
                          │ client_name           │
                          └───────────────────────┘
```

### Supabase RPC 函數

| 函數名稱 | 功能 |
|---------|------|
| `search_similar_documents(query_embedding, match_threshold, match_count, filter_document_type)` | 向量相似度搜尋歷史文件 |
| `batch_generate_labor_receipts()` | 批次產生待處理的勞報單 |

---

## 5. API Routes 一覽

### 文件處理 API

| API | 方法 | 功能 |
|-----|------|------|
| `/api/documents/parse` | POST | 解析 PDF/Word 文件為純文字 |
| `/api/documents/embed` | POST | 將文字切塊並向量化，存入 document_embeddings |
| `/api/documents/process` | POST | 一鍵處理：解析 + 向量化 |
| `/api/documents/search` | POST | 向量相似度搜尋知識庫 |
| `/api/documents/generate` | POST | Claude 根據相似文件生成新文件 |
| `/api/documents/analyze-proposal` | POST | AI 分析提案書，提取專案建立資訊 |

### LINE 整合 API

| API | 方法 | 功能 |
|-----|------|------|
| `/api/messaging/webhook` | POST | LINE Webhook 接收事件（HMAC-SHA256 驗簽） |
| `/api/messaging/bindUser` | POST | 產生 LINE Login 綁定連結 |
| `/api/messaging/bindCallback` | GET | LINE Login OAuth 回調處理 |
| `/api/messaging/setupCommand` | POST | 群組設定指令處理 |
| `/api/messaging/trackMember` | POST | 追蹤群組成員變動 |
| `/api/messaging/detectMeeting` | POST | AI 偵測訊息中的會議時間 |
| `/api/line/analyze` | POST | AI 對話摘要分析 |

### 會議 API

| API | 方法 | 功能 |
|-----|------|------|
| `/api/meetings` | GET/POST | 會議記錄 CRUD |
| `/api/meetings/[id]` | GET/PUT/DELETE | 單筆會議記錄操作 |
| `/api/meetings/analyze` | POST | Claude 分析逐字稿，匹配洽談案件 |

### 活動追蹤 API

| API | 方法 | 功能 |
|-----|------|------|
| `/api/activities` | GET/POST | 活動/任務 CRUD（支援篩選、分頁） |
| `/api/activities/[id]` | GET/PUT/DELETE | 單筆活動操作 |
| `/api/activities/batch` | POST | 批次活動操作 |

### Storage API

| API | 方法 | 功能 |
|-----|------|------|
| `/api/storage/check` | GET | 檢查 Supabase Storage 設定狀態 |
| `/api/storage/backfill` | POST | 回溯下載 LINE 遺漏檔案 |

### 排程 API (Vercel Cron)

| API | 排程 | 功能 |
|-----|------|------|
| `/api/cron/meeting-reminders` | 每日 08:00 UTC | 發送會議提醒 |
| `/api/cron/auto-summary` | 每日 22:00 UTC | 自動產生 LINE 群組 AI 摘要 |

---

## 6. 關鍵業務流程

### 6.1 銷售管道流程

```
新增洽談案件 (/cases)
       │
       ▼
 Kanban 管理 (/prospects)
 初談 → 提案 → 報價 → 談判 → 待簽約
       │                        │
       ▼                        ▼
    已失單                   已成交 → 自動轉為專案
                                       │
                                       ▼
                              專案進行中 (/projects/[id])
                                       │
                                       ▼
                                    專案結案
```

### 6.2 分潤與付款流程

```
專案建立 → 設定分潤比例 → 產生分潤記錄 (commissions)
                                    │
客戶付款 → 登錄付款記錄 (payments)   │
              │                      │
              ▼                      ▼
     計算付款比例 ────────→ 可發放分潤 = 分潤額 × 付款比例 - 已發放
                                    │
                                    ▼
                          財務審核 → 建立發放記錄 (commission_payouts)
                                    │
                                    ▼
                          自動產生勞報單 (labor_receipts)
                           ├─ 計算扣繳稅 10%
                           ├─ 計算健保費 2.11% (≥20,000)
                           └─ 計算實發金額
                                    │
                                    ▼
                          業務下載 PDF → 確認完成
```

### 6.3 LINE 訊息擷取流程

```
LINE 群組訊息 → LINE Platform → Webhook POST
                                     │
                          HMAC-SHA256 驗簽
                                     │
                                     ▼
                         ┌───────────┴───────────┐
                         │                       │
                    文字/貼圖/位置          圖片/影片/檔案
                         │                       │
                         ▼                       ▼
                   line_messages 表      下載 binary content
                                              │
                                              ▼
                                    上傳至 Supabase Storage
                                     (chat-files bucket)
                                              │
                                              ▼
                                    file_url 寫入 line_messages
```

### 6.4 AI 文件生成流程

```
[建立知識庫]
上傳文件 → 解析文字 → 切塊 (≤8000 chars) → OpenAI 向量化 → 存入 pgvector

[生成文件]
輸入需求 → 需求向量化 → search_similar_documents() → 取得相似文件
                                                         │
                                         相似文件作為 context ──→ Claude 生成
                                                                      │
                                                                      ▼
                                                              回傳生成內容
                                                            + 參考文件列表
                                                            + 相似度百分比
```

### 6.5 會議分析流程

```
上傳 Seameet 逐字稿 → 載入現有洽談案件/專案列表
                              │
                              ▼
                     Claude 分析逐字稿
                              │
                    ┌─────────┴──────────┐
                    │                    │
              自動匹配案件          提取分析結果
              (prospect/project)    ├─ 摘要
                                   ├─ 重點
                                   ├─ 待辦事項 (含負責人)
                                   ├─ 客戶情緒
                                   ├─ 成交機率
                                   └─ 建議階段
                    │                    │
                    └────────┬───────────┘
                             ▼
                     儲存 meeting_records
                     (analysis_result JSON)
```

---

## 7. 導航結構

### 主導航（6 入口）

| 圖標 | 標籤 | 路徑 | 涵蓋頁面 | 可見角色 |
|------|------|------|---------|---------|
| 📊 | 儀表板 | `/dashboard` | dashboard | 全部 |
| 📁 | 案件 | `/cases` | cases, prospects, projects/* | 全部 |
| 💰 | 財務 | `/finance` | finance, payments, commissions, labor-receipts | admin, finance |
| 💰 | 我的分潤 | `/my-payouts` | my-payouts | leader, pm, sales |
| 💬 | LINE | `/line-integration` | line-integration, meetings | 全部 |
| 🤖 | 工具 | `/ai-generator` | ai-generator, knowledge-base | 全部 |
| ⚙️ | 設定 | `/settings` | settings | admin, leader |

### 個人設定入口

- 桌面版：導航列右側個人設定按鈕 → `/profile`
- 手機版：底部導航列

---

## 8. 環境變數

| 變數 | 必要性 | 用途 |
|------|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 必要 | Supabase 專案 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 必要 | Supabase 匿名金鑰 |
| `OPENAI_API_KEY` | 選用 | 文件向量化 (embeddings) |
| `ANTHROPIC_API_KEY` | 選用 | AI 文件生成 / 會議分析 (Claude) |
| `LINE_CHANNEL_SECRET` | 選用 | LINE Messaging API 驗簽 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 選用 | LINE Messaging API 呼叫 |
| `LINE_LOGIN_CHANNEL_ID` | 選用 | LINE Login OAuth |
| `LINE_LOGIN_CHANNEL_SECRET` | 選用 | LINE Login OAuth |

---

## 9. 檔案結構

```
E:\commission-system\
├── pages/
│   ├── _app.js                    # 全域 Layout 包裝
│   ├── index.js                   # 首頁（重導至 /cases）
│   ├── login.js                   # 登入頁
│   ├── dashboard.js               # 儀表板
│   ├── cases.js                   # 案件管理
│   ├── prospects.js               # 洽談管道 (Kanban)
│   ├── projects/[id].js           # 專案詳情
│   ├── finance.js                 # 財務總覽
│   ├── my-payouts.js              # 我的分潤
│   ├── payments.js                # 付款記錄
│   ├── commissions.js             # 分潤管理
│   ├── payout-management.js       # 發放管理
│   ├── labor-receipts.js          # 勞報單
│   ├── line-integration.js        # LINE 群組管理
│   ├── meetings.js                # 會議管理
│   ├── ai-generator.js            # AI 工具
│   ├── knowledge-base.js          # 知識庫
│   ├── settings.js                # 系統設定
│   ├── profile.js                 # 個人設定
│   ├── storage-check.js           # Storage 診斷
│   ├── user-management.js         # 用戶管理
│   ├── maintenance.js             # 維護費管理
│   └── api/                       # API Routes (見第 5 節)
│
├── components/
│   ├── Layout.js                  # 主導航框架（含角色判斷）
│   ├── FileUpload.js              # 檔案上傳元件
│   ├── ProjectDocuments.js        # 專案文件檢視
│   └── DocumentVersions.js        # 文件版本控制
│
├── utils/
│   ├── supabaseClient.js          # Supabase 連線
│   ├── simpleAuth.js              # useSimpleAuth() Hook
│   ├── permissions.js             # 角色權限定義
│   ├── commissionPayoutManager.js # 分潤計算引擎
│   ├── laborReceiptGenerator.js   # 勞報單產生
│   ├── laborReceiptPDF.js         # 勞報單 PDF
│   ├── laborFormGenerator.js      # 勞報單表單
│   ├── pdfGenerator.js            # 通用 PDF 工具
│   ├── exportUtils.js             # Excel/PDF 匯出
│   ├── fileUpload.js              # 上傳處理
│   └── auth.js                    # 認證輔助
│
├── styles/
│   ├── globals.css                # 全域樣式
│   ├── Dashboard.module.css       # 儀表板樣式
│   ├── Prospects.module.css       # 洽談管道樣式
│   └── UserManagement.module.css  # 用戶管理樣式
│
├── migrations/                    # SQL 遷移腳本 (001~011 + 功能性)
├── supabase/                      # 基礎建設 SQL (建表、修復)
├── scripts/                       # 工具腳本 (backfill-files.js)
├── vercel.json                    # Vercel 部署設定 + Cron Jobs
└── package.json                   # 依賴與指令
```

---

## 10. 外部服務整合

```
┌──────────────────────────────────────────────────┐
│              川輝業務分潤系統                       │
├──────────────────────────────────────────────────┤
│                                                  │
│   ┌─────────┐  ┌──────────┐  ┌───────────────┐  │
│   │Supabase │  │  Vercel  │  │ LINE Platform │  │
│   │         │  │          │  │               │  │
│   │ • Auth  │  │ • 部署   │  │ • Messaging   │  │
│   │ • DB    │  │ • CDN    │  │   API         │  │
│   │ • Storage│ │ • Cron   │  │ • Login OAuth │  │
│   │ • RPC   │  │ • 無伺服器│  │ • Webhook     │  │
│   └─────────┘  └──────────┘  └───────────────┘  │
│                                                  │
│   ┌──────────────┐  ┌─────────────────────────┐  │
│   │  OpenAI API  │  │  Anthropic Claude API   │  │
│   │              │  │                         │  │
│   │ • Embeddings │  │ • 文件生成              │  │
│   │   向量化     │  │ • 會議分析              │  │
│   │              │  │ • 提案書解析            │  │
│   │              │  │ • 對話摘要              │  │
│   └──────────────┘  └─────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```
