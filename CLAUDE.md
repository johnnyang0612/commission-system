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