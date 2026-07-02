# GovConSignalSite

Web app for managing federal contracting opportunities as a CRM-first workflow, with user-owned API usage and selective contract tracking.

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
- Watchlists are now implemented at `/watchlists`.
- The current product direction is being revised away from platform-owned bulk sync and toward tracked-contract CRM workflows.

## Master Prompt Alignment

Development follows [Docs/Master Prompt Government Contracting.txt](Docs/Master%20Prompt%20Government%20Contracting.txt) as source of truth.
Execution sequencing is tracked in [Docs/MVP_EXECUTION_PLAN.md](Docs/MVP_EXECUTION_PLAN.md).
The CRM-first product reset is defined in [Docs/CRM_REVAMP_PLAN.md](Docs/CRM_REVAMP_PLAN.md).

Current execution target is the CRM-first reset:

- Auth
- Company profiles
- Watchlists and targeting preferences
- User-provided API key flow
- Search/import of user-selected contracts
- Tracked contract dashboard
- Status, notes, and follow-up workflow

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

## Step 5 Progress: Watchlists

Watchlist creation and storage are now implemented:

- [app/watchlists/page.tsx](app/watchlists/page.tsx)
- [app/watchlists/actions.ts](app/watchlists/actions.ts)
- [supabase/migrations/20260523_000002_watchlists.sql](supabase/migrations/20260523_000002_watchlists.sql)

Dashboard now links into the watchlists workflow.

## Step 6 Progress: Admin and Audit

Admin oversight and audit logging are now implemented:

- [app/admin/page.tsx](app/admin/page.tsx)
- [app/admin/actions.ts](app/admin/actions.ts)
- [supabase/migrations/20260523_000003_admin_audit.sql](supabase/migrations/20260523_000003_admin_audit.sql)

Security handling:

- Audit logs are metadata-only and are sanitized to avoid password or payment-card fields.
- Admin access is gated by `ADMIN_EMAILS` in environment configuration.

## Current implementation note

The repository still contains earlier opportunity sync, scoring, and proposal-prep features from the pre-pivot direction. Those flows are now candidates for refactor, de-scope, or removal as the CRM-first plan is implemented.

## Step 7 Progress: Opportunities Ingestion and Matching

SAM.gov opportunities sync and storage were implemented in the earlier roadmap and are now being reevaluated under the CRM-first revamp:

- [app/opportunities/page.tsx](app/opportunities/page.tsx)
- [app/opportunities/actions.ts](app/opportunities/actions.ts)
- [lib/samgov.ts](lib/samgov.ts)
- [supabase/migrations/20260524_000004_opportunities.sql](supabase/migrations/20260524_000004_opportunities.sql)

Dashboard now links into the opportunities workflow.
