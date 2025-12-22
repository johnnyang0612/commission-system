# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js-based commission management system (業務分潤管理系統) for 川輝科技. It manages sales projects, commission calculations, payment tracking, and business prospects with a role-based access control system.

## Development Commands

```bash
npm install    # Install dependencies
npm run dev    # Run development server (http://localhost:3000)
npm run build  # Build for production
npm run start  # Start production server
```

## Architecture

### Tech Stack
- **Framework**: Next.js 14.2.3 with Pages Router
- **Database/Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Charts**: Recharts for dashboard visualizations
- **Drag & Drop**: react-beautiful-dnd for Kanban boards
- **PDF Generation**: jspdf, pdfmake for labor receipts and reports
- **Excel Export**: xlsx for data export
- **AI/RAG**: OpenAI embeddings + Claude for document generation

### Application Structure

```
pages/
├── _app.js              # Global layout wrapper (applies Layout to all pages)
├── index.js             # Project management (專案管理) - contains commission calculation logic
├── dashboard.js         # Dashboard with charts and KPIs
├── prospects.js         # Sales pipeline/Kanban (洽談管理) - uses react-beautiful-dnd
├── commissions.js       # Commission management (分潤管理)
├── payments.js          # Payment records (付款記錄)
├── labor-receipts.js    # Labor receipt generation (勞報單)
├── user-management.js   # User administration
├── maintenance.js       # Maintenance fee management
├── projects/[id].js     # Project detail page
├── ai-generator.js      # AI document generation (RAG)
├── knowledge-base.js    # Knowledge base management
└── api/
    ├── activities/      # REST API for activity tracking
    └── documents/       # AI document processing APIs
```

### Core Business Logic

**Commission Calculation** (`pages/index.js:106-166`):
- Tiered commission for new projects: 35% (≤100K) → 30% (100-300K) → 25% (300-600K) → 20% (600K-1M) → 10% (>1M)
- Fixed 15% for renewal projects
- Optional fixed percentage override

**Role-Based Permissions** (`utils/permissions.js`):
- `admin`: Full access
- `finance`: View/edit costs, profits, manage users
- `leader`: View all projects, manage users
- `sales`: View own projects only

**Authentication Flow** (`utils/simpleAuth.js`):
- Uses Supabase Auth with session management
- Auto-syncs users to `users` table on first login
- Handles pre-created users (IDs starting with `pre_`)

## ⚠️ CRITICAL: Layout Component Usage

**DO NOT wrap pages with Layout component in individual page files!**

Layout is automatically applied via `_app.js`. Adding `<Layout>` in page files causes double headers.

```javascript
// ❌ WRONG - causes double header
import Layout from '../components/Layout';
export default function Page() {
  return <Layout><div>Content</div></Layout>;
}

// ✅ CORRECT - return content directly
export default function Page() {
  return <div className={styles.container}>Content</div>;
}
```

**Exception:** Pages in `noLayoutPages` array (`/login`, `/test-login`, `/auth/callback`) manage their own layout.

## Styling Conventions

This project uses two styling approaches:
1. **Inline styles**: Most pages use inline styles directly in JSX (see `components/Layout.js`)
2. **CSS Modules**: Complex pages like Prospects and Dashboard use CSS Modules in `styles/` directory

When adding new pages:
- Simple pages: Use inline styles for consistency with existing code
- Complex pages with many styles: Create a `styles/PageName.module.css` file

### Database Tables (Key Tables)

- `users` - User accounts with roles
- `projects` - Client projects with payment templates
- `project_installments` - Payment schedule per project
- `commissions` - Commission records per project/user
- `commission_payouts` - Actual payout records
- `prospects` - Sales pipeline deals
- `activities` - Action/task tracking for prospects
- `project_documents` - File attachments
- `labor_receipts` - Labor receipt records
- `document_embeddings` - Vector embeddings for AI document search (pgvector)

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# AI Features (Optional - for document generation)
OPENAI_API_KEY=sk-proj-xxx          # For document vectorization (embeddings)
ANTHROPIC_API_KEY=sk-ant-xxx        # For AI document generation (Claude)
```

### Database Migrations

SQL migration files are in two directories:
- `migrations/`: Feature-specific migrations (commission logic, user roles, etc.)
- `supabase/`: Infrastructure and table creation scripts

Run migrations directly in Supabase SQL editor. No automated migration tool is used.

## Supabase Client Usage

Always import the supabase client from `utils/supabaseClient.js`:

```javascript
import { supabase } from '../utils/supabaseClient';

// Check if supabase is available before queries
if (!supabase) return;
const { data, error } = await supabase.from('table').select('*');
```

## Authentication Pattern

Use the `useSimpleAuth` hook from `utils/simpleAuth.js` for user authentication:

```javascript
import { useSimpleAuth } from '../utils/simpleAuth';

export default function Page() {
  const { user, loading } = useSimpleAuth();

  if (loading) return <div>載入中...</div>;
  if (!user) return null; // Layout handles redirect

  // user.id, user.email, user.name, user.role available
}
```

Note: The Layout component already handles auth checking and redirects. Individual pages typically don't need to handle unauthenticated state.

---

## AI 文件生成系統 (RAG Architecture)

### Overview

系統使用 RAG (Retrieval-Augmented Generation) 架構，讓業務人員可以根據歷史文件自動生成提案書、規格書、報價單。

### Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI 文件生成流程                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 文件上傳              2. 知識庫處理           3. AI 生成     │
│  ┌──────────────┐        ┌──────────────┐       ┌────────────┐ │
│  │ 上傳 PDF/Word │        │ 解析文字內容  │       │ 業務輸入需求│ │
│  │ 到專案文件    │   →    │ 產生向量嵌入  │       │     ↓      │ │
│  │              │        │ 存入 pgvector │       │ 搜尋相似文件│ │
│  └──────────────┘        └──────────────┘       │     ↓      │ │
│                                ↑                │ Claude 生成 │ │
│                                └────────────────┴────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### New Pages

| 頁面 | 路徑 | 功能 |
|------|------|------|
| AI 文件生成器 | `/ai-generator` | 輸入客戶需求，自動生成專業文件 |
| 知識庫管理 | `/knowledge-base` | 管理哪些文件加入 AI 知識庫 |

### New API Routes

| API | 方法 | 功能 |
|-----|------|------|
| `/api/documents/parse` | POST | 解析 PDF/Word 文件為純文字 |
| `/api/documents/embed` | POST | 將文字轉換為向量嵌入 |
| `/api/documents/process` | POST | 一鍵處理：解析 + 向量化 |
| `/api/documents/search` | POST | 搜尋相似文件 |
| `/api/documents/generate` | POST | 使用 Claude 生成新文件 |

### Key Dependencies

```json
{
  "pdf-parse": "PDF 文件解析",
  "mammoth": "Word (.docx) 文件解析"
}
```

### Database: document_embeddings Table

```sql
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY,
    document_id UUID REFERENCES project_documents(id),
    project_id UUID REFERENCES projects(id),
    content_text TEXT,           -- 解析後的文字內容
    chunk_index INTEGER,         -- 區塊索引 (大文件分割)
    chunk_total INTEGER,         -- 總區塊數
    embedding vector(1536),      -- 向量嵌入 (OpenAI text-embedding-3-small)
    document_type VARCHAR(50),   -- proposal, specification, quotation, etc.
    document_name VARCHAR(255),
    client_name VARCHAR(255),
    created_at TIMESTAMP
);
```

### Supabase RPC Function

```sql
-- 相似度搜尋函數
search_similar_documents(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5,
    filter_document_type VARCHAR DEFAULT NULL
)
```

### Usage Flow

1. **建立知識庫**：
   - 上傳提案書/規格書/報價單到專案文件
   - 到 `/knowledge-base` 點擊「加入知識庫」處理文件

2. **生成新文件**：
   - 到 `/ai-generator`
   - 選擇文件類型（提案書/規格書/報價單）
   - 輸入客戶名稱、專案名稱、需求描述
   - AI 會搜尋相似的歷史文件作為參考
   - 使用 Claude 生成專業文件

### Supported Document Types

- `proposal` - 提案書
- `specification` - 規格書
- `quotation` - 報價單
- `contract` - 合約
- `meeting_notes` - 會議記錄

### Cost Estimation

| 服務 | 用途 | 費用 |
|------|------|------|
| OpenAI Embedding | 文件向量化 | ~$0.02 / 1M tokens |
| Claude Sonnet | 文件生成 | ~$3 / 1M input tokens |

### Troubleshooting

- **「缺少 OpenAI API Key」**：檢查 `.env.local` 中的 `OPENAI_API_KEY`
- **「缺少 Anthropic API Key」**：檢查 `.env.local` 中的 `ANTHROPIC_API_KEY`
- **知識庫是空的**：先到專案上傳文件，再到知識庫處理
- **PDF 解析失敗**：確認 PDF 不是掃描圖片，需要是文字型 PDF

---

## 智能建案功能

### Overview

上傳已簽約的提案書/合約，AI 自動分析並提取專案資訊，一鍵建立專案。

### 入口

1. **案件頁面** (`/cases`) - 「🚀 智能建案」按鈕
2. **工具頁面** (`/ai-generator?tab=smart-project`) - 智能建案 Tab

### API

| API | 方法 | 功能 |
|-----|------|------|
| `/api/documents/analyze-proposal` | POST | 上傳提案書，AI 分析提取專案資訊 |

### 提取資訊

- 客戶名稱、專案名稱
- 合約金額、貨幣
- 付款條件、分期付款明細
- 專案類型（新專案/續約）
- 專案期程、範圍摘要
- 聯絡人資訊

---

## LINE 整合系統

### Overview

系統與 LINE Official Account 整合，自動記錄群組對話、檔案，並提供 AI 摘要分析。

### 主要頁面

| 頁面 | 路徑 | 功能 |
|------|------|------|
| LINE 群組管理 | `/line-integration` | 查看群組、訊息、檔案、成員、AI 摘要 |
| 會議管理 | `/meetings` | AI 偵測的會議時間、提醒功能 |

### LINE 群組功能

- **訊息 Tab** - 查看對話紀錄（台北時區）
- **成員 Tab** - 群組成員列表（員工/客戶/PO）
- **檔案 Tab** - 群組內分享的檔案
- **AI 摘要 Tab** - Claude 分析對話重點

### 訊息儲存機制

所有 LINE 訊息**永久保存**在系統中：

| 內容類型 | 儲存位置 |
|---------|---------|
| 文字訊息 | `line_messages` 表 `content` 欄位 |
| 圖片/影片/音訊 | Supabase Storage `chat-files` bucket |
| 檔案 (PDF, Word 等) | Supabase Storage `chat-files` bucket |
| 貼圖 | `line_messages` 表 (sticker_id) |
| 位置 | `line_messages` 表 (經緯度、地址) |

即使 LINE 原始內容過期，系統仍保有完整備份。

### LINE 帳號綁定

員工可在個人設定頁面 (`/profile`) 綁定 LINE 帳號：
- 使用 LINE Login OAuth 流程
- 綁定後系統可識別群組內訊息發送者身份
- 管理員可在設定頁面 (`/settings`) 查看所有用戶的綁定狀態

### API Routes

| API | 功能 |
|-----|------|
| `/api/messaging/webhook` | LINE Webhook 接收訊息 |
| `/api/messaging/bindUser` | 產生 LINE 綁定連結 |
| `/api/messaging/bindCallback` | LINE Login 回調處理 |
| `/api/messaging/setupCommand` | 群組設定指令 (`/設定`) |
| `/api/messaging/trackMember` | 追蹤群組成員 |
| `/api/messaging/detectMeeting` | AI 偵測會議時間 |
| `/api/line/analyze` | AI 對話摘要分析 |

### 環境變數

```
LINE_CHANNEL_SECRET=xxx           # LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=xxx     # LINE Messaging API
LINE_LOGIN_CHANNEL_ID=xxx         # LINE Login
LINE_LOGIN_CHANNEL_SECRET=xxx     # LINE Login
```

---

## 勞務報酬單系統

### Overview

管理業務分潤的勞務報酬單，支援自動計算稅額、批次產生、PDF 列印。

### 主要頁面

| 頁面 | 路徑 | 功能 |
|------|------|------|
| 勞報單管理 | `/labor-receipts` | 列表、篩選、批次產生、匯出 |
| 專案詳情 | `/projects/[id]` | 新增勞報單表單 |
| 個人設定 | `/profile` | 查看個人勞報單 |

### 功能特點

1. **金額可自訂** - 關聯期數後仍可修改金額（支援分段給付）
2. **自動計算** - 扣繳稅額 (10%)、二代健保 (2.11% for ≥20,000)
3. **PDF 列印** - 空白欄位顯示底線，讓受領人手寫填寫
4. **銀行資訊** - PDF 包含匯款帳戶區塊

### PDF 內容結構

```
┌─────────────────────────────────┐
│           勞務報酬單             │
├─────────────────────────────────┤
│ 專案資訊                         │
│ - 開立日期、勞務期間             │
│ - 專案名稱、委託單位             │
├─────────────────────────────────┤
│ 受領人資料（請填寫完整）         │
│ - 姓名、身分證字號               │
│ - 聯絡電話、通訊地址             │
├─────────────────────────────────┤
│ 匯款帳戶資訊（請填寫完整）       │
│ - 銀行名稱、銀行代碼             │
│ - 帳號、戶名                     │
├─────────────────────────────────┤
│ 報酬明細                         │
│ - 總額、扣繳稅、健保費、實發金額 │
├─────────────────────────────────┤
│ 簽章：受領人 / 經辦人 / 主管     │
└─────────────────────────────────┘
```

---

## 用戶管理與多角色

### 角色系統

| 角色 | 說明 | 權限 |
|------|------|------|
| `admin` | 管理員 | 完整權限 |
| `finance` | 財務 | 查看/編輯成本、利潤 |
| `leader` | 主管 | 查看所有專案、管理用戶 |
| `pm` | PM | 專案管理 |
| `sales` | 業務 | 查看自己的專案 |

### 多角色支援

- 用戶可同時擁有多個角色（`users.roles` TEXT[] 欄位）
- 主要角色由優先級最高的角色決定
- 優先級：admin > finance > leader > pm > sales

### 設定頁面 (`/settings`)

- **用戶管理 Tab** - 管理用戶角色、查看 LINE 綁定狀態
- **知識庫 Tab** - 管理 AI 知識庫文件（僅 admin）

---

## 導航結構

### 主導航 (6 入口)

| 圖標 | 標籤 | 路徑 | 說明 |
|------|------|------|------|
| 📊 | 儀表板 | `/dashboard` | 統計圖表、KPI |
| 📁 | 案件 | `/cases` | 專案管理、洽談管道 |
| 💰 | 財務/我的分潤 | `/finance` or `/my-payouts` | 依角色顯示 |
| 💬 | LINE | `/line-integration` | LINE 群組管理 |
| 🤖 | 工具 | `/ai-generator` | AI 文件生成、智能建案 |
| ⚙️ | 設定 | `/settings` | 用戶管理（admin/leader）|

### 個人設定入口

- 桌面版：導航列右側「⚙️ 個人設定」按鈕
- 手機版：底部導航「👤 個人」→ 側邊選單

---

## 最近更新 (2024-12)

1. **智能建案** - 上傳提案書自動建立專案
2. **LINE 成員顯示** - 群組詳情新增成員 Tab
3. **LINE 綁定修復** - 使用 email 作為 fallback
4. **時區修正** - LINE 訊息顯示台北時區
5. **勞報單改版** - 支援空白欄位手寫、銀行資訊
6. **多角色 UI** - 設定頁面 checkbox 選擇多角色
7. **用戶 LINE 狀態** - 設定頁面顯示綁定狀態