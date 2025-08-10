# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js-based commission management system (業務分潤管理系統) for 川輝科技. It uses Supabase as the backend database and authentication service.

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

## Architecture

### Tech Stack
- **Framework**: Next.js 14.2.3 with React 18.2.0
- **Database/Backend**: Supabase (using @supabase/supabase-js)
- **Pages Router**: Using Next.js pages directory structure

### Key Components

1. **Supabase Client** (`utils/supabaseClient.js`): Centralized Supabase client configuration using environment variables
2. **Main Page** (`pages/index.js`): Displays case listings from the 'cases' table with client names and amounts

### Environment Setup

Before running the application, create a `.env.local` file based on `.env.local.example`:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key

### Database Schema

The application expects a Supabase table called 'cases' with at least:
- `id`: Unique identifier
- `client_name`: Client name field
- `amount`: Transaction amount field

## Vercel Deployment

### Deployment Steps

1. Push code to GitHub repository
2. Connect repository to Vercel
3. Configure environment variables in Vercel Dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy (Vercel will automatically detect Next.js configuration)

### Build Settings (Auto-detected by Vercel)
- Framework Preset: Next.js
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`