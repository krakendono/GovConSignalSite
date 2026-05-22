# GovSignal AI MVP Execution Plan

This plan is derived from `Docs/Master Prompt Government Contracting.txt` and is treated as implementation source of truth.

## Non-negotiable Rules

- Website only (no desktop app).
- AI assists users; it never auto-submits proposals.
- Human review required before submission.
- Use verified company/user data only.
- Explicitly mark uncertainty and missing information.
- Never invent qualifications, certifications, pricing, staffing, or legal claims.

## Current Build Phase

Phase 1: Foundation

- Auth
- Company profiles
- NAICS/PSC storage
- Opportunities ingestion
- Dashboard
- Basic filtering

## Build Order Lock

1. Next.js app
2. Tailwind
3. Supabase
4. Auth
5. Database schema
6. Company profile system
7. Watchlists
8. SAM.gov opportunities integration
9. Opportunity storage
10. Dashboard
11. AI summaries
12. Match scoring
13. Notifications
14. Historical intelligence
15. Proposal generation
16. Exports
17. Stripe
18. Admin

## Decision Policy

When uncertain or scope expands unexpectedly, return to the current MVP phase and ship the smallest working increment.

## Delivered So Far

- Step 3: Supabase foundation with server/client helpers and env scaffolding.
- Step 4: Auth scaffold (magic-link login, callback, protected dashboard).
- Step 5: Database schema migration for users, companies, company_profiles, NAICS/PSC tables, and RLS policies.
- Step 6 (started): Company profile intake page with save action and NAICS/PSC mapping persistence.
