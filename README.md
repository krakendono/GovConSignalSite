# GovConSignalSite

Starter web app for surfacing federal contracting opportunities from the GSA public opportunities API:

https://open.gsa.gov/api/get-opportunities-public-api/

This repository is prepared as the baseline for a master-prompt driven build process.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS

## Local development

1. Install Node.js LTS.
2. Install dependencies:

```bash
npm install
```

3. Start development server:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

## Current status

- Next.js + Tailwind baseline is in place.
- Root route is configured in the app router.
- VS Code task created at `.vscode/tasks.json` as `dev: next`.

## Master Prompt Alignment

Development follows [Docs/Master Prompt Government Contracting.txt](Docs/Master%20Prompt%20Government%20Contracting.txt) as source of truth.
Execution sequencing is tracked in [Docs/MVP_EXECUTION_PLAN.md](Docs/MVP_EXECUTION_PLAN.md).

Current execution target is MVP Phase 1:

- Auth
- Company profiles
- NAICS/PSC storage
- Pull opportunities
- Opportunity dashboard
- Basic filtering

## Step 1 Progress: Supabase Foundation

Supabase SDKs are installed and base clients are wired for browser and server contexts.

Configuration files:

- [.env.example](.env.example)
- [lib/env.ts](lib/env.ts)
- [lib/supabase/client.ts](lib/supabase/client.ts)
- [lib/supabase/server.ts](lib/supabase/server.ts)

To configure locally:

1. Copy `.env.example` to `.env.local`
2. Add your Supabase project URL and anon key
3. Restart the dev server

## Step 2 Progress: Auth Scaffold

Supabase Auth scaffolding is in place:

- [app/auth/login/page.tsx](app/auth/login/page.tsx)
- [app/auth/login/actions.ts](app/auth/login/actions.ts)
- [app/auth/callback/route.ts](app/auth/callback/route.ts)
- [app/dashboard/page.tsx](app/dashboard/page.tsx)
- [proxy.ts](proxy.ts)

Routes ready to test:

- /auth/login
- /auth/callback
- /dashboard

## Step 3 Progress: Database Schema

Supabase migration created for Phase 1 tables and Row Level Security:

- [supabase/migrations/20260521_000001_phase1_schema.sql](supabase/migrations/20260521_000001_phase1_schema.sql)

Core tables added:

- users
- companies
- company_profiles
- naics_codes
- psc_codes
- company_naics_codes
- company_psc_codes

## Step 4 Progress: Company Profile System

Company profile intake UI and save flow are now implemented:

- [app/company-profile/page.tsx](app/company-profile/page.tsx)
- [app/company-profile/actions.ts](app/company-profile/actions.ts)

Dashboard now links into the company profile workflow.
