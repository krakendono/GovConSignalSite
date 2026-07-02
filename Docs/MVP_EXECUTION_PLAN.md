# GovSignal CRM-First Execution Plan

This plan is derived from `Docs/Master Prompt Government Contracting.txt` and is treated as implementation source of truth.

Current direction is further refined by `Docs/CRM_REVAMP_PLAN.md`, which takes priority when the earlier master prompt conflicts with the CRM-first pivot.

## Non-negotiable Rules

- Website only (no desktop app).
- AI assists users; it never auto-submits proposals.
- Human review required before submission.
- Use verified company/user data only.
- Explicitly mark uncertainty and missing information.
- Never invent qualifications, certifications, pricing, staffing, or legal claims.

## Current Build Phase

Phase 1: CRM-first reset

- Auth
- Company profiles
- Watchlists and targeting preferences
- User-owned API key flow
- Tracked contract storage and refresh
- Dashboard and admin oversight
- Contract statuses, notes, and follow-up workflow
- Minimal manual AI assistance only where justified

## Build Order Lock

1. Next.js app
2. Tailwind
3. Supabase
4. Auth
5. Database schema
6. Company profile system
7. Watchlists
8. User API credential storage
9. Search/import tracked contract flow
10. Tracked contract storage
11. Dashboard and CRM workflow
12. Notes, reminders, and next actions
13. Manual refresh for tracked records
14. Targeted notifications
15. Optional manual AI helpers
16. Admin

## Decision Policy

When uncertain or scope expands unexpectedly, return to the current MVP phase and ship the smallest working increment.

## Delivered So Far


## Next Build Slice

## Next Build Slice

- Step 8: user-owned API credentials and replacement of bulk sync with tracked-contract search/import.
