# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js-based commission management system (業務分潤管理系統) for 川輝科技. It manages sales projects, commission calculations, payment tracking, and business prospects with a role-based access control system. The UI language is Traditional Chinese (繁體中文).

## Development Commands

```bash
npm install    # Install dependencies
npm run dev    # Run development server (http://localhost:3000)
npm run build  # Build for production
npm run start  # Start production server
```

There is no linting, formatting, or test framework configured. No test runner exists.

## Deployment

Deployed on **Vercel**. Configuration in `vercel.json` includes two cron jobs:
- `/api/cron/meeting-reminders` — daily at 08:00 UTC
- `/api/cron/auto-summary` — daily at 22:00 UTC

## Architecture

### Tech Stack
- **Framework**: Next.js 14.2.3 with **Pages Router** (not App Router)
- **Database/Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Charts**: Recharts for dashboard visualizations
- **Drag & Drop**: react-beautiful-dnd for Kanban boards
- **PDF Generation**: jspdf, pdfmake for labor receipts and reports
- **Excel Export**: xlsx for data export
- **AI/RAG**: OpenAI embeddings + Claude for document generation

### Key Directories

```
pages/           # Next.js pages (Pages Router) and API routes
components/      # Shared React components (Layout, FileUpload, ProjectDocuments, DocumentVersions)
utils/           # Auth, permissions, Supabase client, PDF generators, export utilities
styles/          # CSS Modules (Dashboard, Prospects, UserManagement) + globals.css
migrations/      # Numbered SQL migration files (001-011 + feature-specific)
supabase/        # Infrastructure SQL scripts (table creation, auth fixes)
scripts/         # Utility scripts (backfill-files.js)
```

**Note**: Many legacy SQL files exist in the project root (e.g., `create_*.sql`, `fix_*.sql`, `add_*.sql`). These are one-off migration scripts that were run directly in Supabase SQL editor. New migrations should go in `migrations/`.

### Core Business Logic

**Commission Calculation** (`pages/index.js:106-166`):
- Tiered commission for new projects: 35% (≤100K) → 30% (100-300K) → 25% (300-600K) → 20% (600K-1M) → 10% (>1M)
- Fixed 15% for renewal projects
- Optional fixed percentage override per project

**Role-Based Permissions** (`utils/permissions.js`):
- `admin`: Full access
- `finance`: View/edit costs, profits, manage users, view all projects
- `leader`: View all projects, manage users
- `pm`: View all projects (no financial or user management access)
- `sales`: View own projects only

Users can hold multiple roles (`users.roles` TEXT[] column). Primary role = highest priority: admin > finance > leader > pm > sales.

**Authentication** (`utils/simpleAuth.js`):
- Uses Supabase Auth with session management
- Auto-syncs users to `users` table on first login
- Handles pre-created users (IDs starting with `pre_`) by merging on first real login
- Layout component handles auth checking and redirects — individual pages don't need to

## CRITICAL: Layout Component Usage

**DO NOT wrap pages with Layout component in individual page files!**

Layout is automatically applied via `_app.js`. Adding `<Layout>` in page files causes double headers.

```javascript
// WRONG - causes double header
import Layout from '../components/Layout';
export default function Page() {
  return <Layout><div>Content</div></Layout>;
}

// CORRECT - return content directly
export default function Page() {
  return <div className={styles.container}>Content</div>;
}
```

**Exception:** Pages in `noLayoutPages` array (`/login`, `/test-login`, `/auth/callback`) manage their own layout.

## Styling Conventions

- **Inline styles**: Most pages use inline styles directly in JSX
- **CSS Modules**: Complex pages use `styles/PageName.module.css`

When adding new pages: use inline styles for simple pages, CSS Modules for complex ones.

## Supabase Client Usage

Always import from `utils/supabaseClient.js`:

```javascript
import { supabase } from '../utils/supabaseClient';

if (!supabase) return;
const { data, error } = await supabase.from('table').select('*');
```

## Authentication Pattern

```javascript
import { useSimpleAuth } from '../utils/simpleAuth';

export default function Page() {
  const { user, loading } = useSimpleAuth();
  if (loading) return <div>載入中...</div>;
  if (!user) return null; // Layout handles redirect
  // user.id, user.email, user.name, user.role available
}
```

## Database

### Key Tables

- `users` - User accounts with roles (supports multi-role via `roles` TEXT[])
- `projects` - Client projects with payment templates
- `project_installments` - Payment schedule per project
- `commissions` - Commission records per project/user
- `commission_payouts` - Actual payout records
- `prospects` - Sales pipeline deals (Kanban stages)
- `activities` - Action/task tracking for prospects
- `project_documents` - File attachments
- `labor_receipts` - Labor receipt records
- `line_groups`, `line_messages`, `line_group_members` - LINE integration data
- `meeting_records` - AI-detected meetings from LINE chats
- `document_embeddings` - Vector embeddings for AI document search (pgvector)

### Migrations

SQL migration files are in `migrations/` and `supabase/`. Run directly in Supabase SQL editor — no automated migration tool is used.

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Optional (AI features):
```
OPENAI_API_KEY=...           # Document vectorization (embeddings)
ANTHROPIC_API_KEY=...        # AI document generation (Claude)
```

Optional (LINE integration):
```
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_LOGIN_CHANNEL_ID=...
LINE_LOGIN_CHANNEL_SECRET=...
```

## Major Subsystems

### Navigation Structure

The app has 6 main nav entries (defined in `components/Layout.js`). Finance/sales users see different nav labels. The nav item for finances routes to `/finance` for admin/finance roles, `/my-payouts` for others. Settings is only visible to admin/leader.

### LINE Integration

- Webhook at `/api/messaging/webhook` receives LINE messages and downloads media files to Supabase Storage (`chat-files` bucket)
- All messages are permanently stored even after LINE content expires (7-day limit)
- `/storage-check` page provides diagnostics and backfill for missed file downloads
- LINE account binding via OAuth on `/profile` page

### AI Document Generation (RAG)

- Upload documents → parse (pdf-parse/mammoth) → vectorize (OpenAI embeddings) → store in `document_embeddings` with pgvector
- Generate new documents by searching similar historical docs and using Claude
- Smart project creation: upload signed proposals, AI extracts project info
- Supabase RPC function `search_similar_documents` handles similarity search

### Labor Receipts (勞務報酬單)

- Auto-calculates withholding tax (10%) and supplementary health insurance (2.11% for amounts ≥20,000)
- PDF generation with blank fields for handwritten recipient info
- Related utils: `utils/laborReceiptPDF.js`, `utils/laborReceiptGenerator.js`, `utils/laborFormGenerator.js`
